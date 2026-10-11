import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

import {
  api,
  crmUser,
  insertActivity,
  insertContact,
  insertCustomer,
  insertParticipant,
  insertProject,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Concurrencia del Módulo 2, de forma determinista (mismo patrón que la prueba
 * de bloqueo de catálogos): una transacción de la prueba toma el bloqueo que
 * tomaría una escritura concurrente, hace su cambio y **no confirma**; la petición
 * debe esperar y, al confirmar, decidir con lo confirmado.
 *
 * - RN-02.26: elegir principal un contacto que otra transacción desactiva → `422`.
 * - RN-02.22: eliminar un cliente mientras otra transacción le crea un proyecto → `409`.
 * - RN-02.27: eliminar un contacto mientras otra transacción lo añade a una actividad → `409`.
 *
 * País propio `Q7`.
 */

let context: TestContext;
let q7: string;

beforeAll(async () => {
  context = await createTestContext();
  q7 = await testCountry(context.prisma, 'Q7', { name: 'Prueba Siete' });
});

afterAll(async () => {
  await closeTestContext(context);
});

/**
 * Abre una transacción que ejecuta `hold` y queda abierta hasta `release()`.
 * Devuelve cuándo terminó `hold` (`locked`) y la promesa de la transacción.
 */
function holdTransaction(hold: (tx: PrismaClient) => Promise<void>): {
  locked: Promise<void>;
  release: () => void;
  done: Promise<void>;
} {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalLocked: () => void = () => undefined;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const done = context.prisma.$transaction(
    async (tx) => {
      await hold(tx as unknown as PrismaClient);
      signalLocked();
      await released;
    },
    { timeout: 20_000 },
  );
  return { locked, release, done };
}

/** Lanza la petición y comprueba que sigue pendiente tras 500 ms (espera al bloqueo). */
async function expectWaiting(test: request.Test): Promise<() => Promise<request.Response>> {
  let settled = false;
  const pending = test.then((response) => {
    settled = true;
    return response;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(settled).toBe(false);
  return () => pending;
}

describe('Contacto principal bajo concurrencia (RN-02.26)', () => {
  it('elegir principal espera al bloqueo del cliente y rechaza el contacto desactivado en paralelo', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: q7 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q7 });
    const contactId = await insertContact(context.prisma, { customerId: customer.id });

    // Otra escritura (como la desactivación de la API) bloquea el cliente y desactiva el contacto sin confirmar.
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
      await tx.contact.update({ where: { id: contactId }, data: { isActive: false } });
    });
    try {
      await holder.locked;
      const response = await expectWaiting(
        api(context, owner.token).put(`/customers/${customer.id}/primary-contact`).send({ contactId }),
      );

      holder.release();
      await holder.done;
      const result = await response();
      // Sin el bloqueo y la relectura, la API habría fijado como principal un contacto inactivo (200).
      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({ code: 'CONTACT_INACTIVE' });
    } finally {
      holder.release();
    }
    const stored = await context.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(stored.primaryContactId).toBeNull();
  });

  it('desactivar el principal mientras se elige otro deja como mucho un principal activo', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: q7 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q7 });
    const first = await insertContact(context.prisma, { customerId: customer.id });
    const second = await insertContact(context.prisma, { customerId: customer.id });
    const client = api(context, owner.token);
    await client.put(`/customers/${customer.id}/primary-contact`).send({ contactId: first }).expect(200);

    const results = await Promise.all([
      client.patch(`/customers/${customer.id}/contacts/${first}`).send({ isActive: false }),
      client.put(`/customers/${customer.id}/primary-contact`).send({ contactId: second }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);

    // Gane quien gane, el principal es el segundo (activo) y nunca el desactivado.
    const stored = await context.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(stored.primaryContactId).toBe(second);
  });
});

describe('Eliminación sin TOCTOU (RN-02.22, RN-02.27)', () => {
  it('eliminar un cliente espera a quien le está creando un proyecto y responde 409', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: q7 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: q7 });

    // Quien crea un dependiente toma FOR SHARE sobre el cliente (CustomerReferenceGuard con tx) e inserta.
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR SHARE`;
      await insertProject(tx, { customerId: customer.id, ownerId: manager.id, countryId: q7 });
    });
    try {
      await holder.locked;
      const response = await expectWaiting(api(context, manager.token).delete(`/customers/${customer.id}`));

      holder.release();
      await holder.done;
      const result = await response();
      // Sin contar dentro de la transacción con la fila bloqueada, se habría eliminado (204).
      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({ code: 'CUSTOMER_HAS_DEPENDENCIES', details: [{ dependency: 'projects', count: 1 }] });
    } finally {
      holder.release();
    }
    expect((await context.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).deletedAt).toBeNull();
  });

  it('eliminar un contacto espera a quien lo está añadiendo a una actividad y responde 409', async () => {
    // manager: tiene contactos.eliminar (el asesor no elimina).
    const owner = await crmUser(context, { roleCodes: ['manager'], countryId: q7 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q7 });
    const contactId = await insertContact(context.prisma, { customerId: customer.id });
    const activityId = await insertActivity(context.prisma, { customerId: customer.id, ownerId: owner.id });

    // La inserción de la participación (sin confirmar) bloquea la fila del contacto con KEY SHARE (FK).
    const holder = holdTransaction(async (tx) => {
      await insertParticipant(tx, { activityId, customerId: customer.id, contactId });
    });
    try {
      await holder.locked;
      const pending = api(context, owner.token).delete(`/customers/${customer.id}/contacts/${contactId}`);
      const response = await expectWaiting(pending);

      holder.release();
      await holder.done;
      const result = await response();
      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({ code: 'CONTACT_HAS_HISTORY' });
    } finally {
      holder.release();
    }
    expect((await context.prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).deletedAt).toBeNull();
  });
});
