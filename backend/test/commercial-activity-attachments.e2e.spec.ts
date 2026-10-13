import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type request from 'supertest';

import { DOCX_BYTES, HTML_BYTES, PDF_BYTES, PNG_BYTES } from '@/modules/attachments/testing/attachment-fixtures';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertCustomer,
  insertTeam,
  insertVisit,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 4 · Adjuntos por dueño (04 F.4, DC-2, DC-4, D-04.18; PF-04.62 y PF-04.67)
 * con el almacenamiento en el directorio temporal de `ATTACHMENTS_STORAGE_PATH`
 * (`setup-env.ts`). País propio `A4`.
 */

const STORAGE_PATH = process.env.ATTACHMENTS_STORAGE_PATH as string;
const TEN_MIB = 10 * 1024 * 1024;
const MINUTE = 60_000;

let context: TestContext;
let a4: string;

beforeAll(async () => {
  context = await createTestContext();
  a4 = await testCountry(context.prisma, 'A4', { name: 'Prueba Adjuntos Actividad' });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function ownerWithCustomer(): Promise<{ user: CrmUser; customerId: string }> {
  const user = await crmUser(context, { roleCodes: ['asesor'], countryId: a4 });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: a4 });
  return { user, customerId: customer.id };
}

function upload(user: CrmUser, path: string, content: Buffer, fileName: string): request.Test {
  return api(context, user.token).post(path).attach('file', content, fileName);
}

function download(user: CrmUser, path: string): request.Test {
  return api(context, user.token)
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

/** Binarios grandes escritos desde `since` (las suites comparten la carpeta: no se compara el listado completo). */
async function largeFilesSince(since: number, minBytes: number): Promise<string[]> {
  try {
    const entries = await readdir(STORAGE_PATH, { recursive: true, withFileTypes: true });
    const large: string[] = [];
    for (const entry of entries.filter((item) => item.isFile())) {
      const path = join(entry.parentPath, entry.name);
      const info = await stat(path);
      if (info.mtimeMs >= since && info.size >= minBytes) large.push(path);
    }
    return large;
  } catch {
    return [];
  }
}

async function eventsOf(user: CrmUser, visitId: string): Promise<{ id: string; eventType: string; attachmentCount: number; canAttachFiles: boolean }[]> {
  return (await api(context, user.token).get(`/visits/${visitId}/events`).expect(200)).body;
}

// ---------------------------------------------------------------------------
// 401 / 403
// ---------------------------------------------------------------------------

describe('Autenticación y permisos de las rutas de adjuntos (PF-04.45)', () => {
  it('401 sin token y 403 sin el permiso en todas las rutas por dueño', async () => {
    const id = randomUUID();
    const eventId = randomUUID();
    const attachmentId = randomUUID();
    const calls = (client: ReturnType<typeof api>): (() => request.Test)[] => [
      () => client.get(`/visits/${id}/attachments`),
      () => client.post(`/visits/${id}/attachments`).attach('file', PDF_BYTES, 'a.pdf'),
      () => client.get(`/visits/${id}/attachments/${attachmentId}/content`),
      () => client.delete(`/visits/${id}/attachments/${attachmentId}`),
      () => client.get(`/visits/${id}/events/${eventId}/attachments`),
      () => client.post(`/visits/${id}/events/${eventId}/attachments`).attach('file', PDF_BYTES, 'a.pdf'),
      () => client.get(`/visits/${id}/events/${eventId}/attachments/${attachmentId}/content`),
      () => client.get(`/activities/${id}/attachments`),
      () => client.post(`/activities/${id}/attachments`).attach('file', PDF_BYTES, 'a.pdf'),
      () => client.get(`/activities/${id}/attachments/${attachmentId}/content`),
      () => client.delete(`/activities/${id}/attachments/${attachmentId}`),
    ];
    for (const call of calls(api(context))) await call().expect(401);
    const plain = await crmUser(context, { roleCodes: ['usuario'], countryId: a4 });
    for (const call of calls(api(context, plain.token))) await call().expect(403);
  });

  it('no existen rutas genéricas /attachments/:id ni DELETE de adjuntos de eventos', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const visitId = await insertVisit(context.prisma, { customerId, ownerId: user.id });
    await api(context, user.token).get(`/attachments/${randomUUID()}`).expect(404);
    await api(context, user.token).delete(`/visits/${visitId}/events/${randomUUID()}/attachments/${randomUUID()}`).expect(404);
  });
});

// ---------------------------------------------------------------------------
// PF-04.62 / PF-04.67 · Visita
// ---------------------------------------------------------------------------

describe('Adjuntos de la visita (PF-04.62, PF-04.67, AC-04.28, AC-04.64)', () => {
  it('subir, listar, descargar (attachment, nosniff, no-store) y eliminar; en una confirmada no se elimina (409)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const visitId = await insertVisit(context.prisma, { customerId, ownerId: user.id });

    const created = await upload(user, `/visits/${visitId}/attachments`, PDF_BYTES, 'Acta de visita.pdf').field('description', 'Acta').expect(201);
    expect(created.headers['location']).toBe(`/api/v1/visits/${visitId}/attachments/${created.body.id}/content`);
    expect(created.body).toMatchObject({ fileName: 'Acta de visita.pdf', contentType: 'application/pdf', sizeBytes: PDF_BYTES.length, description: 'Acta', createdBy: { id: user.id } });
    expect(created.body).not.toHaveProperty('storageKey');

    const listed = await client.get(`/visits/${visitId}/attachments`).expect(200);
    expect(listed.body.data.map((item: { id: string }) => item.id)).toEqual([created.body.id]);
    expect((await client.get(`/visits/${visitId}`).expect(200)).body.attachmentCount).toBe(1);

    const file = await download(user, `/visits/${visitId}/attachments/${created.body.id}/content`).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="Acta de visita.pdf"; filename\*=UTF-8''Acta%20de%20visita.pdf$/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toBe('no-store');
    expect(Buffer.compare(file.body as Buffer, PDF_BYTES)).toBe(0);

    await client.delete(`/visits/${visitId}/attachments/${created.body.id}`).expect(204);
    expect((await client.get(`/visits/${visitId}/attachments`).expect(200)).body.data).toEqual([]);
    await download(user, `/visits/${visitId}/attachments/${created.body.id}/content`).expect(404);
    const audit = await context.prisma.auditLog.findMany({ where: { resourceType: 'crm.attachment', resourceId: created.body.id }, select: { event: true } });
    expect(audit.map((row) => row.event).sort()).toEqual(['crm.attachment.added', 'crm.attachment.removed']);

    // Realizada: admite adjuntos. Confirmada: ni subir ni eliminar (RN-04.21, 00 §2.11).
    const done = await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REALIZADA', actualStartAt: new Date(), resultSummary: 'ok' });
    const kept = await upload(user, `/visits/${done}/attachments`, PNG_BYTES, 'foto.png').expect(201);
    await context.prisma.visit.update({
      where: { id: done },
      data: { statusId: await catalogItemId(context.prisma, 'crm.estado_visita', 'CONFIRMADA'), confirmedAt: new Date(), confirmedById: user.id },
    });
    expect((await client.delete(`/visits/${done}/attachments/${kept.body.id}`).expect(409)).body.code).toBe('RECORD_READ_ONLY');
    expect((await upload(user, `/visits/${done}/attachments`, PDF_BYTES, 'tarde.pdf').expect(409)).body.code).toBe('RECORD_READ_ONLY');
    await download(user, `/visits/${done}/attachments/${kept.body.id}/content`).expect(200);
  });

  it('adjunto de otro dueño en la ruta → 404; dueño fuera del alcance → 404; visible sin poder editar → 403', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const first = await insertVisit(context.prisma, { customerId, ownerId: user.id });
    const second = await insertVisit(context.prisma, { customerId, ownerId: user.id });
    const attached = await upload(user, `/visits/${first}/attachments`, PDF_BYTES, 'a.pdf').expect(201);
    await download(user, `/visits/${second}/attachments/${attached.body.id}/content`).expect(404);
    await api(context, user.token).delete(`/visits/${second}/attachments/${attached.body.id}`).expect(404);
    await download(user, `/activities/${first}/attachments/${attached.body.id}/content`).expect(404);

    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: a4 });
    await download(stranger, `/visits/${first}/attachments/${attached.body.id}/content`).expect(404);
    await api(context, stranger.token).get(`/visits/${first}/attachments`).expect(404);
    await upload(stranger, `/visits/${first}/attachments`, PDF_BYTES, 'b.pdf').expect(404);

    // Visible (manager del equipo) pero sin `visitas.administrar`: 403 antes de leer el archivo.
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: a4, deny: ['visitas.administrar'] });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [user.id] });
    await api(context, manager.token).get(`/visits/${first}/attachments`).expect(200);
    const denied = await upload(manager, `/visits/${first}/attachments`, PDF_BYTES, 'c.pdf').expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'visitas.administrar' }] });
    expect((await api(context, manager.token).delete(`/visits/${first}/attachments/${attached.body.id}`).expect(403)).body.code).toBe('PERMISSION_DENIED');
  });

  it('tipo no permitido por firma → 422; mayor que crm.adjuntos.max_mb → 413 sin fila ni binario; validación del multipart → 400', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const visitId = await insertVisit(context.prisma, { customerId, ownerId: user.id });
    const executable = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(64)]);
    for (const [content, fileName] of [
      [executable, 'factura.pdf'],
      [HTML_BYTES, 'pagina.pdf'],
      [PDF_BYTES, 'script.exe'],
    ] as [Buffer, string][]) {
      expect((await upload(user, `/visits/${visitId}/attachments`, content, fileName).expect(422)).body.code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');
    }
    // Mayor que `crm.adjuntos.max_mb` (10 MiB sembrados): sin cambiar el parámetro, que otras suites usan a la vez.
    const since = Date.now();
    const tooBig = Buffer.concat([PDF_BYTES, Buffer.alloc(TEN_MIB)]);
    const response = await upload(user, `/visits/${visitId}/attachments`, tooBig, 'grande.pdf').expect(413);
    expect(response.body).toMatchObject({ code: 'ATTACHMENT_TOO_LARGE', details: [expect.objectContaining({ field: 'file' })] });
    expect(await largeFilesSince(since, 1024 * 1024)).toEqual([]);
    expect(await context.prisma.attachment.count({ where: { visitId } })).toBe(0);
    const noFile = await api(context, user.token).post(`/visits/${visitId}/attachments`).field('description', 'x').expect(400);
    expect(noFile.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field: 'file' }] });
    await api(context, user.token).post('/visits/no-es-uuid/attachments').attach('file', PDF_BYTES, 'a.pdf').expect(400);
  });
});

// ---------------------------------------------------------------------------
// PF-04.62 · Evento de visita (D-04.18)
// ---------------------------------------------------------------------------

describe('Adjuntos de un evento de visita (PF-04.62, AC-04.41)', () => {
  it('quien reprogramó adjunta en los 15 minutos (201) y se ve en el historial; otro usuario → 403; vencido → 409', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: a4 });
    const { user, customerId } = await ownerWithCustomer();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [user.id] });
    const client = api(context, user.token);
    const visit = await client.post('/visits').send({ customerId, scheduledStartAt: new Date(Date.now() + 86_400_000).toISOString(), objective: 'Con evento' }).expect(201);
    await client.post(`/visits/${visit.body.id}/rescheduling`).send({ newScheduledStartAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), reasonText: 'Cliente' }).expect(200);
    const rescheduled = (await eventsOf(user, visit.body.id)).find((event) => event.eventType === 'RESCHEDULED');
    if (!rescheduled) throw new Error('falta el evento RESCHEDULED');
    const path = `/visits/${visit.body.id}/events/${rescheduled.id}/attachments`;

    const created = await upload(user, path, DOCX_BYTES, 'carta.docx').expect(201);
    expect(created.headers['location']).toBe(`/api/v1${path}/${created.body.id}/content`);
    expect((await eventsOf(user, visit.body.id)).find((event) => event.id === rescheduled.id)?.attachmentCount).toBe(1);
    const listed = await client.get(path).expect(200);
    expect(listed.body.data.map((item: { id: string }) => item.id)).toEqual([created.body.id]);
    const file = await download(manager, `${path}/${created.body.id}/content`).expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    // Los adjuntos de un evento no cuentan como adjuntos de la visita.
    expect((await client.get(`/visits/${visit.body.id}/attachments`).expect(200)).body.data).toEqual([]);

    const denied = await upload(manager, path, PDF_BYTES, 'otro.pdf').expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ reason: 'NOT_EVENT_PERFORMER' }] });

    const oldEvent = await context.prisma.visitEvent.create({
      data: {
        visitId: visit.body.id,
        eventType: 'RESCHEDULED',
        fromStatusId: await catalogItemId(context.prisma, 'crm.estado_visita', 'REPROGRAMADA'),
        toStatusId: await catalogItemId(context.prisma, 'crm.estado_visita', 'REPROGRAMADA'),
        previousScheduledStartAt: new Date(),
        newScheduledStartAt: new Date(Date.now() + MINUTE),
        reasonText: 'Antiguo',
        performedById: user.id,
        occurredAt: new Date(Date.now() - 16 * MINUTE),
      },
    });
    // `canAttachFiles` del historial sale de la misma regla: quien lo ejecutó y dentro de la ventana.
    const flags = new Map((await eventsOf(user, visit.body.id)).map((event) => [event.id, event.canAttachFiles]));
    expect(flags.get(rescheduled.id)).toBe(true);
    expect(flags.get(oldEvent.id)).toBe(false);
    expect((await eventsOf(manager, visit.body.id)).every((event) => event.canAttachFiles === false)).toBe(true);
    const expired = await upload(user, `/visits/${visit.body.id}/events/${oldEvent.id}/attachments`, PDF_BYTES, 'tarde.pdf').expect(409);
    expect(expired.body).toMatchObject({ code: 'RECORD_READ_ONLY', details: [{ reason: 'EVENT_ATTACHMENT_WINDOW_EXPIRED' }] });

    // Evento de otra visita en la ruta → 404.
    const otherVisit = await insertVisit(context.prisma, { customerId, ownerId: user.id });
    await upload(user, `/visits/${otherVisit}/events/${rescheduled.id}/attachments`, PDF_BYTES, 'x.pdf').expect(404);
    await download(user, `/visits/${otherVisit}/events/${rescheduled.id}/attachments/${created.body.id}/content`).expect(404);
    expect(await context.prisma.attachment.count({ where: { visitEventId: { in: [rescheduled.id, oldEvent.id] } } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PF-04.67 · Actividad
// ---------------------------------------------------------------------------

describe('Adjuntos de la actividad (PF-04.67, AC-04.64)', () => {
  it('abierta: subir, descargar y eliminar (204, deja de listarse); completada: ni subir ni eliminar (409)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const activityId = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    const created = await upload(user, `/activities/${activityId}/attachments`, PDF_BYTES, 'propuesta.pdf').expect(201);
    expect(created.headers['location']).toBe(`/api/v1/activities/${activityId}/attachments/${created.body.id}/content`);
    const file = await download(user, `/activities/${activityId}/attachments/${created.body.id}/content`).expect(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await client.get(`/activities/${activityId}`).expect(200)).body.attachmentCount).toBe(1);
    await client.delete(`/activities/${activityId}/attachments/${created.body.id}`).expect(204);
    expect((await client.get(`/activities/${activityId}/attachments`).expect(200)).body.data).toEqual([]);

    const kept = await upload(user, `/activities/${activityId}/attachments`, PDF_BYTES, 'final.pdf').expect(201);
    await client.post(`/activities/${activityId}/completion`).send({ resultNotes: 'Hecho' }).expect(200);
    expect((await client.delete(`/activities/${activityId}/attachments/${kept.body.id}`).expect(409)).body.code).toBe('RECORD_READ_ONLY');
    expect((await upload(user, `/activities/${activityId}/attachments`, PDF_BYTES, 'tarde.pdf').expect(409)).body.code).toBe('RECORD_READ_ONLY');
    await download(user, `/activities/${activityId}/attachments/${kept.body.id}/content`).expect(200);

    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: a4 });
    await download(stranger, `/activities/${activityId}/attachments/${kept.body.id}/content`).expect(404);
    await upload(stranger, `/activities/${activityId}/attachments`, PDF_BYTES, 'x.pdf').expect(404);
  });
});
