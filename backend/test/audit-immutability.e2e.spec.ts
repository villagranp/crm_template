import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { withParameter } from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Inmutabilidad de la bitácora (RN-07.38, AC-07.37, ADR-025): disparadores de
 * `20261014100000_audit_logs_append_only` probados desde la conexión de la
 * aplicación (mismo usuario y esquema que el backend), sin desactivarlos.
 *
 * - `UPDATE` y `TRUNCATE` siempre se rechazan.
 * - `DELETE` se rechaza dentro de `auditoria.dias_retencion` y se permite fuera.
 *
 * La bitácora es compartida con las demás suites: cada prueba trabaja solo con
 * filas propias (identificador único) y nunca cuenta totales globales.
 * Las antigüedades se eligen para que el resultado no dependa del valor vigente
 * del parámetro (30–3650): 1 día siempre está dentro; 3 700 días, siempre fuera.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_KEY = 'auditoria.dias_retencion';
/** SQLSTATE propio del disparador (ver la migración). */
const APPEND_ONLY_SQLSTATE = 'AU001';

let ctx: TestContext;

function api() {
  return request(ctx.app.getHttpServer());
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** Inserta una fila propia con la antigüedad indicada y devuelve su id. */
async function insertRow(ageDays: number): Promise<string> {
  const id = randomUUID();
  await ctx.prisma.auditLog.create({
    data: {
      id,
      event: 'prueba.inmutabilidad',
      correlationId: `inmutable-${id.slice(0, 8)}`,
      resourceType: 'prueba',
      resourceId: id,
      changes: { name: { before: 'A', after: 'B' } },
      occurredAt: daysAgo(ageDays),
    },
  });
  return id;
}

async function rowExists(id: string): Promise<boolean> {
  return (await ctx.prisma.auditLog.count({ where: { id } })) === 1;
}

/** Comprueba que la base rechazó la sentencia con el error del disparador, sin datos de la fila. */
async function expectRejected(statement: Promise<unknown>, operation: RegExp): Promise<void> {
  const error = await statement.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).not.toBeNull();
  const message = String((error as Error).message);
  expect(message).toMatch(/audit_logs es de solo inserción/);
  expect(message).toMatch(operation);
  expect(message).toContain(APPEND_ONLY_SQLSTATE);
}

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('audit_logs: la base rechaza modificar la bitácora (ADR-025)', () => {
  it('UPDATE de una fila se rechaza (también por Prisma)', async () => {
    const id = await insertRow(1);
    await expectRejected(ctx.prisma.$executeRaw`UPDATE audit_logs SET event = 'alterado' WHERE id = ${id}::uuid`, /UPDATE/);
    await expectRejected(ctx.prisma.auditLog.update({ where: { id }, data: { subjectEmail: 'otro@integration.test' } }), /UPDATE/);
    const row = await ctx.prisma.auditLog.findUniqueOrThrow({ where: { id } });
    expect(row.event).toBe('prueba.inmutabilidad');
    expect(row.subjectEmail).toBeNull();
  });

  it('UPDATE de una fila fuera de la retención también se rechaza', async () => {
    const id = await insertRow(3700);
    await expectRejected(ctx.prisma.$executeRaw`UPDATE audit_logs SET changes = NULL WHERE id = ${id}::uuid`, /UPDATE/);
    // Se deja limpia: fuera de la retención sí se puede borrar.
    await ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${id}::uuid`;
  });

  it('TRUNCATE se rechaza siempre y no borra nada', async () => {
    const id = await insertRow(1);
    // Dentro de una transacción que se revierte: si el disparador faltara, el
    // TRUNCATE no afectaría a las suites que corren en paralelo.
    const outcome = await ctx.prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe('TRUNCATE audit_logs');
        throw new Error('TRUNCATE no fue rechazado');
      })
      .then(
        () => null,
        (caught: unknown) => caught as Error,
      );
    expect(outcome?.message).toMatch(/audit_logs es de solo inserción: TRUNCATE no permitido/);
    expect(await rowExists(id)).toBe(true);
  });

  it('DELETE de una fila dentro de la retención se rechaza (también por Prisma)', async () => {
    const id = await insertRow(1);
    await expectRejected(ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${id}::uuid`, /periodo de retención/);
    await expectRejected(ctx.prisma.auditLog.deleteMany({ where: { id } }), /periodo de retención/);
    expect(await rowExists(id)).toBe(true);
  });

  it('un DELETE masivo que incluye una fila dentro de la retención se rechaza entero', async () => {
    const recent = await insertRow(1);
    const old = await insertRow(3700);
    await expectRejected(
      ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id IN (${recent}::uuid, ${old}::uuid)`,
      /periodo de retención/,
    );
    expect(await rowExists(recent)).toBe(true);
    expect(await rowExists(old)).toBe(true);
    await ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${old}::uuid`;
  });

  it('DELETE de una fila más antigua que la retención se permite (purga futura)', async () => {
    const id = await insertRow(3700);
    expect(await ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${id}::uuid`).toBe(1);
    expect(await rowExists(id)).toBe(false);
  });

  it('la función del disparador fija su search_path (pg_catalog, pg_temp): no resuelve objetos de la sesión', async () => {
    const [row] = await ctx.prisma.$queryRaw<{ config: string[] | null }[]>`
      SELECT p.proconfig AS config
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'audit_logs_append_only' AND n.nspname = current_schema()`;
    expect(row?.config).toEqual(['search_path=pg_catalog, pg_temp']);
  });

  it('INSERT sigue permitido (solo inserción)', async () => {
    const id = await insertRow(0);
    expect(await rowExists(id)).toBe(true);
  });
});

describe('audit_logs: retención leída de system_parameters', () => {
  it('respeta el valor configurado: con 30 días, una fila de 100 días se puede borrar y una de 10 no', async () => {
    await withParameter(ctx.prisma, RETENTION_KEY, '30', async () => {
      const deletable = await insertRow(100);
      const kept = await insertRow(10);
      expect(await ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${deletable}::uuid`).toBe(1);
      await expectRejected(ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${kept}::uuid`, /\(30 días\)/);
    });
  });

  it.each([['no-es-un-numero'], ['0'], ['29'], ['']])(
    'un valor ilegible o por debajo del mínimo (%j) se trata como 365: nunca más permisivo',
    async (value) => {
      await withParameter(ctx.prisma, RETENTION_KEY, value, async () => {
        const insideDefault = await insertRow(100);
        await expectRejected(ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${insideDefault}::uuid`, /\(365 días\)/);
        const outsideDefault = await insertRow(400);
        expect(await ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${outsideDefault}::uuid`).toBe(1);
      });
    },
  );
});

describe('API: la bitácora no tiene rutas de escritura (PF-07.38)', () => {
  let adminToken: string;
  let id: string;

  beforeAll(async () => {
    adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;
    id = await insertRow(1);
  });

  it.each([['patch'], ['put'], ['delete']] as const)('%s /audit-logs/{id} → 404 incluso para el administrador', async (method) => {
    await api()[method](`/api/v1/audit-logs/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ event: 'alterado' }).expect(404);
    expect((await ctx.prisma.auditLog.findUniqueOrThrow({ where: { id } })).event).toBe('prueba.inmutabilidad');
  });

  it('POST /audit-logs y DELETE /audit-logs → 404', async () => {
    await api().post('/api/v1/audit-logs').set('Authorization', `Bearer ${adminToken}`).send({ event: 'inventado' }).expect(404);
    await api().delete('/api/v1/audit-logs').set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('401 sin token y 403 sin auditoria.ver en la consulta', async () => {
    await api().get('/api/v1/audit-logs').query({ resourceId: id }).expect(401);
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get('/api/v1/audit-logs').query({ resourceId: id }).set('Authorization', `Bearer ${token}`).expect(403);
  });
});
