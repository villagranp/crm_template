import { randomUUID } from 'node:crypto';

import { calendarDateIn, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';

import { api, EXCLUSIVE_TIMEOUT_MS, exclusiveParameters } from './support/crm-fixtures';
import { accessTokenFor, closeTestContext, createTestContext, createTestUser, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Ajustes 1 · Minuto de seguridad (AJ1-2; RN-AJ1.7–RN-AJ1.13, D-AJ1.5) contra PostgreSQL:
 * `GET/POST /safety-minutes`, `GET/PATCH/DELETE /safety-minutes/{id}` y `GET /me/safety-minute`
 * (PF-AJ1.5, PF-AJ1.6, PF-AJ1.14–PF-AJ1.18, PF-AJ1.21).
 *
 * `safety_minutes` es una tabla compartida de un solo mensaje por fecha y las suites corren en
 * paralelo sobre el mismo esquema: esta suite (y `me-settings`) toman un candado exclusivo y
 * vacían la tabla antes y después. «Hoy» se calcula en la zona del negocio, como el servidor.
 */

let context: TestContext;
let releaseTable: () => Promise<void>;
let adminToken: string;
let plainToken: string;
let viewerToken: string;
let creatorToken: string;
let editorToken: string;
let deleterToken: string;
let today: string;

function addDays(date: string, days: number): string {
  return toCalendarDate(new Date(fromCalendarDate(date).getTime() + days * 86_400_000));
}

/** Usuario con un rol propio que solo concede `permissionCodes`. */
async function tokenWithPermissions(permissionCodes: string[]): Promise<string> {
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
  expect(permissions).toHaveLength(permissionCodes.length);
  const code = `test-sm-${randomUUID().slice(0, 8)}`;
  await context.prisma.role.create({
    data: { code, name: `Rol de prueba ${code}`, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
  return accessTokenFor(context.app, await createTestUser(context.prisma, { roleCodes: [code] }));
}

async function auditEvents(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

async function insertMinute(displayDate: string, message = `Mensaje ${displayDate}`): Promise<string> {
  const row = await context.prisma.safetyMinute.create({ data: { message, displayDate: fromCalendarDate(displayDate) } });
  return row.id;
}

async function createViaApi(displayDate: string, message = `Mensaje ${displayDate}`): Promise<{ id: string }> {
  const response = await api(context, adminToken).post('/safety-minutes').send({ message, displayDate }).expect(201);
  return { id: response.body.id as string };
}

beforeAll(async () => {
  releaseTable = await exclusiveParameters('safety-minutes-table');
  context = await createTestContext();
  await context.prisma.safetyMinute.deleteMany();

  const timeZone = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'crm.zona_horaria_negocio' } })).value;
  today = calendarDateIn(new Date(), timeZone);

  adminToken = (await tokenWithRoles(context, ['administrador'])).token;
  plainToken = (await tokenWithRoles(context, ['usuario'])).token;
  viewerToken = await tokenWithPermissions(['minuto_seguridad.ver']);
  creatorToken = await tokenWithPermissions(['minuto_seguridad.crear']);
  editorToken = await tokenWithPermissions(['minuto_seguridad.editar']);
  deleterToken = await tokenWithPermissions(['minuto_seguridad.eliminar']);
}, EXCLUSIVE_TIMEOUT_MS);

afterAll(async () => {
  try {
    await context?.prisma.safetyMinute.deleteMany();
    await closeTestContext(context);
  } finally {
    await releaseTable?.();
  }
});

describe('Autenticación y permisos (PF-AJ1.18, AC-AJ1.15)', () => {
  const id = randomUUID();
  const routes: [method: 'get' | 'post' | 'patch' | 'delete', path: string][] = [
    ['get', '/safety-minutes'],
    ['get', `/safety-minutes/${id}`],
    ['post', '/safety-minutes'],
    ['patch', `/safety-minutes/${id}`],
    ['delete', `/safety-minutes/${id}`],
  ];

  it.each(routes)('401 sin token: %s %s', async (method, path) => {
    const response = await api(context)[method](path).send({});
    expect(response.status).toBe(401);
  });

  it.each(routes)('403 sin ningún permiso minuto_seguridad.* (rol usuario): %s %s', async (method, path) => {
    const response = await api(context, plainToken)[method](path).send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('solo minuto_seguridad.ver: lee, pero crear, editar y eliminar → 403', async () => {
    const client = api(context, viewerToken);
    await client.get('/safety-minutes').expect(200);
    await client.get(`/safety-minutes/${id}`).expect(404);
    const body = { message: 'x', displayDate: addDays(today, 400) };
    expect((await client.post('/safety-minutes').send(body).expect(403)).body.code).toBe('PERMISSION_DENIED');
    await client.patch(`/safety-minutes/${id}`).send({ message: 'x' }).expect(403);
    await client.delete(`/safety-minutes/${id}`).expect(403);
  });

  it('cada operación de escritura exige su propio permiso', async () => {
    const date = addDays(today, 401);
    const { id: minuteId } = await createViaApi(date);

    // Con crear solo se crea; con editar solo se edita; con eliminar solo se borra (y ninguno lee).
    await api(context, creatorToken).get('/safety-minutes').expect(403);
    await api(context, creatorToken).patch(`/safety-minutes/${minuteId}`).send({ message: 'x' }).expect(403);
    await api(context, creatorToken).delete(`/safety-minutes/${minuteId}`).expect(403);
    await api(context, editorToken).post('/safety-minutes').send({ message: 'x', displayDate: addDays(today, 402) }).expect(403);
    await api(context, editorToken).delete(`/safety-minutes/${minuteId}`).expect(403);
    await api(context, deleterToken).patch(`/safety-minutes/${minuteId}`).send({ message: 'x' }).expect(403);
    await api(context, deleterToken).post('/safety-minutes').send({ message: 'x', displayDate: addDays(today, 402) }).expect(403);

    await api(context, creatorToken).post('/safety-minutes').send({ message: 'Alta', displayDate: addDays(today, 402) }).expect(201);
    await api(context, editorToken).patch(`/safety-minutes/${minuteId}`).send({ message: 'Editado' }).expect(200);
    await api(context, deleterToken).delete(`/safety-minutes/${minuteId}`).expect(204);
  });
});

describe('Ciclo de vida de un minuto futuro (PF-AJ1.5, AC-AJ1.8, AC-AJ1.13)', () => {
  it('alta, consulta, edición y borrado, con auditoría de cada paso', async () => {
    const date = addDays(today, 30);
    const admin = api(context, adminToken);

    const created = await admin.post('/safety-minutes').send({ message: '  Revisa tu equipo de protección.  ', displayDate: date }).expect(201);
    expect(created.headers['location']).toBe(`/api/v1/safety-minutes/${created.body.id}`);
    expect(created.body).toEqual({
      id: expect.any(String),
      message: 'Revisa tu equipo de protección.',
      displayDate: date,
      editable: true,
      deletable: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: { id: expect.any(String), displayName: 'Persona De prueba' },
    });
    const id = created.body.id as string;
    const [createdEvent] = await auditEvents('safety_minute.created', id);
    expect(createdEvent).toMatchObject({ resourceType: 'safety_minute' });
    expect(createdEvent?.changes).toMatchObject({ message: { before: null, after: 'Revisa tu equipo de protección.' }, displayDate: { before: null, after: date } });

    const detail = await api(context, viewerToken).get(`/safety-minutes/${id}`).expect(200);
    expect(detail.body).toMatchObject({ id, displayDate: date, editable: true, deletable: true });

    const newDate = addDays(today, 31);
    const updated = await admin.patch(`/safety-minutes/${id}`).send({ message: 'Mensaje corregido', displayDate: newDate }).expect(200);
    expect(updated.body).toMatchObject({ id, message: 'Mensaje corregido', displayDate: newDate, editable: true, deletable: true });
    const [updatedEvent] = await auditEvents('safety_minute.updated', id);
    expect(updatedEvent).toMatchObject({ resourceType: 'safety_minute' });
    expect(updatedEvent?.changes).toEqual({
      message: { before: 'Revisa tu equipo de protección.', after: 'Mensaje corregido' },
      displayDate: { before: date, after: newDate },
    });

    // Sin cambios: 200 y sin un segundo registro.
    await admin.patch(`/safety-minutes/${id}`).send({ message: 'Mensaje corregido' }).expect(200);
    expect(await auditEvents('safety_minute.updated', id)).toHaveLength(1);

    await admin.delete(`/safety-minutes/${id}`).expect(204);
    const [deletedEvent] = await auditEvents('safety_minute.deleted', id);
    expect(deletedEvent).toMatchObject({ resourceType: 'safety_minute' });
    expect(deletedEvent?.changes).toMatchObject({ message: { before: 'Mensaje corregido', after: null }, displayDate: { before: newDate, after: null } });
    expect(await context.prisma.safetyMinute.count({ where: { id } })).toBe(0);
    await admin.get(`/safety-minutes/${id}`).expect(404);
    await admin.delete(`/safety-minutes/${id}`).expect(404);
    await admin.patch(`/safety-minutes/${id}`).send({ message: 'x' }).expect(404);
  });

  it('AC-AJ1.12: el HTML se guarda tal cual y los saltos de línea se respetan', async () => {
    const message = '<img src=x onerror=alert(1)>\n<script>alert(1)</script>\nLínea 3';
    const created = await api(context, adminToken).post('/safety-minutes').send({ message, displayDate: addDays(today, 40) }).expect(201);
    expect(created.body.message).toBe(message);
    const stored = await context.prisma.safetyMinute.findUniqueOrThrow({ where: { id: created.body.id as string } });
    expect(stored.message).toBe(message);
  });

  it('un mensaje de exactamente 1000 caracteres es válido', async () => {
    const created = await api(context, adminToken).post('/safety-minutes').send({ message: 'a'.repeat(1000), displayDate: addDays(today, 41) }).expect(201);
    expect(created.body.message).toHaveLength(1000);
  });

  it('la identidad de quien edita queda en updatedBy', async () => {
    const editor = await tokenWithRoles(context, ['administrador']);
    await context.prisma.user.update({ where: { id: editor.user.id }, data: { displayName: 'Editora Del Mensaje' } });
    const { id } = await createViaApi(addDays(today, 42));
    const response = await api(context, editor.token).patch(`/safety-minutes/${id}`).send({ message: 'Editado por otra persona' }).expect(200);
    expect(response.body.updatedBy).toEqual({ id: editor.user.id, displayName: 'Editora Del Mensaje' });
  });
});

describe('Lista, filtros y orden (AC-AJ1.14)', () => {
  const base = 500;

  beforeAll(async () => {
    for (const offset of [0, 3, 6]) {
      await createViaApi(addDays(today, base + offset), `Lista ${offset}`);
    }
  });

  it('filtra por rango de fechas inclusivo y ordena por fecha descendente por defecto', async () => {
    const response = await api(context, viewerToken)
      .get(`/safety-minutes?from=${addDays(today, base)}&to=${addDays(today, base + 6)}`)
      .expect(200);
    expect(response.body.data.map((row: { message: string }) => row.message)).toEqual(['Lista 6', 'Lista 3', 'Lista 0']);
    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });

    const narrow = await api(context, viewerToken).get(`/safety-minutes?from=${addDays(today, base + 1)}&to=${addDays(today, base + 5)}`).expect(200);
    expect(narrow.body.data.map((row: { message: string }) => row.message)).toEqual(['Lista 3']);
  });

  it('sortOrder asc y paginación', async () => {
    const response = await api(context, viewerToken)
      .get(`/safety-minutes?from=${addDays(today, base)}&to=${addDays(today, base + 6)}&sortOrder=asc&pageSize=2&page=2`)
      .expect(200);
    expect(response.body.data.map((row: { message: string }) => row.message)).toEqual(['Lista 6']);
    expect(response.body.pagination).toMatchObject({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  it('sortBy createdAt es admitido; uno fuera de la lista blanca, `from` > `to` y pageSize > 100 → 400', async () => {
    await api(context, viewerToken).get('/safety-minutes?sortBy=createdAt').expect(200);
    for (const query of ['sortBy=message', `from=${addDays(today, 5)}&to=${addDays(today, 1)}`, 'pageSize=101', 'from=2026-02-30', 'to=ayer']) {
      const response = await api(context, viewerToken).get(`/safety-minutes?${query}`).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
  });

  it('GET /safety-minutes/{id}: id no UUID → 400; inexistente → 404', async () => {
    await api(context, viewerToken).get('/safety-minutes/no-es-uuid').expect(400);
    const response = await api(context, viewerToken).get(`/safety-minutes/${randomUUID()}`).expect(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('Validación (PF-AJ1.15, AC-AJ1.10)', () => {
  let patchOffset = 0;
  const date = () => addDays(today, 60);

  it.each([
    ['mensaje vacío', { message: '', displayDate: 'D' }],
    ['solo espacios', { message: '   \n\t ', displayDate: 'D' }],
    ['1001 caracteres', { message: 'a'.repeat(1001), displayDate: 'D' }],
    ['sin mensaje', { displayDate: 'D' }],
    ['mensaje que no es texto', { message: 123, displayDate: 'D' }],
    ['sin fecha', { message: 'x' }],
    ['fecha imposible', { message: 'x', displayDate: '2026-02-30' }],
    ['fecha con hora', { message: 'x', displayDate: '2026-10-20T10:00:00Z' }],
    ['fecha con otro formato', { message: 'x', displayDate: '20/10/2026' }],
    ['campo extra', { message: 'x', displayDate: 'D', priority: 1 }],
  ])('POST: %s → 400 VALIDATION_FAILED', async (_name, body) => {
    const payload = JSON.parse(JSON.stringify(body).replace('"D"', JSON.stringify(date()))) as object;
    const response = await api(context, adminToken).post('/safety-minutes').send(payload).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it.each([
    ['mensaje vacío', { message: '' }],
    ['solo espacios', { message: '   ' }],
    ['1001 caracteres', { message: 'a'.repeat(1001) }],
    ['mensaje null', { message: null }],
    ['fecha inválida', { displayDate: 'mañana' }],
    ['fecha null', { displayDate: null }],
    ['campo extra', { message: 'x', createdAt: '2020-01-01' }],
  ])('PATCH: %s → 400 VALIDATION_FAILED', async (_name, body) => {
    const { id } = await createViaApi(addDays(today, 600 + patchOffset++));
    const response = await api(context, adminToken).patch(`/safety-minutes/${id}`).send(body).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('la base también rechaza un mensaje en blanco (ck_safety_minutes_message_not_blank)', async () => {
    await expect(
      context.prisma.safetyMinute.create({ data: { message: '   ', displayDate: fromCalendarDate(addDays(today, 2000)) } }),
    ).rejects.toThrow(/ck_safety_minutes_message_not_blank/);
  });
});

describe('Texto plano del mensaje (seguridad)', () => {
  let offset = 0;
  const nextDate = () => addDays(today, 3000 + offset++);

  it.each([
    ['NUL (antes 500 por PostgreSQL 22021)', 'a\u0000b'],
    ['control C0', 'a\u0007b'],
    ['DEL', 'a\u007Fb'],
    ['RLO (U+202E)', 'inicio ‮fdp.exe'],
    ['aislado bidi (U+2066)', 'a⁦b'],
    ['ZWSP dentro del texto', 'a​b'],
    ['solo ZWSP', '​​​'],
    ['solo relleno braille', '⠀⠀'],
    ['solo BOM y espacios', ' ﻿ '],
  ])('POST y PATCH: %s → 400 VALIDATION_FAILED, no 500, y no guarda nada', async (_name, message) => {
    const admin = api(context, adminToken);
    const created = await admin.post('/safety-minutes').send({ message, displayDate: nextDate() }).expect(400);
    expect(created.body.code).toBe('VALIDATION_FAILED');
    const { id } = await createViaApi(nextDate(), 'Original');
    const patched = await admin.patch(`/safety-minutes/${id}`).send({ message }).expect(400);
    expect(patched.body.code).toBe('VALIDATION_FAILED');
    const stored = await context.prisma.safetyMinute.findUniqueOrThrow({ where: { id } });
    expect(stored.message).toBe('Original');
  });

  it('admite saltos de línea y tabulaciones', async () => {
    const message = 'Línea 1\n\tLínea 2';
    const created = await api(context, adminToken).post('/safety-minutes').send({ message, displayDate: nextDate() }).expect(201);
    expect(created.body.message).toBe(message);
  });

  it('CRLF se normaliza a LF al guardar y al contar la longitud', async () => {
    const admin = api(context, adminToken);
    const created = await admin.post('/safety-minutes').send({ message: 'uno\r\ndos\r\ntres', displayDate: nextDate() }).expect(201);
    expect(created.body.message).toBe('uno\ndos\ntres');
    const stored = await context.prisma.safetyMinute.findUniqueOrThrow({ where: { id: created.body.id as string } });
    expect(stored.message).toBe('uno\ndos\ntres');

    const patched = await admin.patch(`/safety-minutes/${created.body.id as string}`).send({ message: 'a\r\nb' }).expect(200);
    expect(patched.body.message).toBe('a\nb');

    // 998 + CRLF + 1 = 1001 caracteres crudos, pero 1000 tras normalizar: válido.
    const edge = `${'a'.repeat(998)}\r\nb`;
    expect(edge).toHaveLength(1001);
    await admin.post('/safety-minutes').send({ message: edge, displayDate: nextDate() }).expect(201);
  });
});

describe('Duplicados y fechas pasadas (PF-AJ1.14, PF-AJ1.16, AC-AJ1.9)', () => {
  it('una segunda alta para la misma fecha → 409 SAFETY_MINUTE_DUPLICATE con details[0].field = displayDate', async () => {
    const date = addDays(today, 70);
    await createViaApi(date);
    const response = await api(context, adminToken).post('/safety-minutes').send({ message: 'Otro', displayDate: date }).expect(409);
    expect(response.body.code).toBe('SAFETY_MINUTE_DUPLICATE');
    expect(response.body.details[0]).toMatchObject({ field: 'displayDate' });
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate(date) } })).toBe(1);
  });

  it('editar la fecha a una ocupada → 409 SAFETY_MINUTE_DUPLICATE y no cambia nada', async () => {
    const taken = addDays(today, 71);
    const free = addDays(today, 72);
    await createViaApi(taken);
    const { id } = await createViaApi(free);
    const response = await api(context, adminToken).patch(`/safety-minutes/${id}`).send({ displayDate: taken }).expect(409);
    expect(response.body.code).toBe('SAFETY_MINUTE_DUPLICATE');
    expect((await context.prisma.safetyMinute.findUniqueOrThrow({ where: { id } })).displayDate).toEqual(fromCalendarDate(free));
    expect(await auditEvents('safety_minute.updated', id)).toHaveLength(0);
  });

  it('crear con fecha pasada → 422 SAFETY_MINUTE_PAST_DATE', async () => {
    const response = await api(context, adminToken).post('/safety-minutes').send({ message: 'x', displayDate: addDays(today, -1) }).expect(422);
    expect(response.body.code).toBe('SAFETY_MINUTE_PAST_DATE');
    expect(response.body.details[0]).toMatchObject({ field: 'displayDate' });
  });

  it('mover uno futuro a una fecha pasada → 422 SAFETY_MINUTE_PAST_DATE', async () => {
    const { id } = await createViaApi(addDays(today, 73));
    const response = await api(context, adminToken).patch(`/safety-minutes/${id}`).send({ displayDate: addDays(today, -2) }).expect(422);
    expect(response.body.code).toBe('SAFETY_MINUTE_PAST_DATE');
  });
});

describe('Bloqueo por fecha (PF-AJ1.17, AC-AJ1.13, D-AJ1.5)', () => {
  it('uno pasado: solo lectura (editable = deletable = false); editar y borrar → 409 SAFETY_MINUTE_LOCKED past', async () => {
    const id = await insertMinute(addDays(today, -5), 'Mensaje ya pasado');
    const admin = api(context, adminToken);
    const detail = await admin.get(`/safety-minutes/${id}`).expect(200);
    expect(detail.body).toMatchObject({ editable: false, deletable: false });

    const patch = await admin.patch(`/safety-minutes/${id}`).send({ message: 'Reescrito' }).expect(409);
    expect(patch.body.code).toBe('SAFETY_MINUTE_LOCKED');
    expect(patch.body.details[0].reason).toBe('past');
    const del = await admin.delete(`/safety-minutes/${id}`).expect(409);
    expect(del.body.code).toBe('SAFETY_MINUTE_LOCKED');
    expect(del.body.details[0].reason).toBe('past');
    expect((await context.prisma.safetyMinute.findUniqueOrThrow({ where: { id } })).message).toBe('Mensaje ya pasado');
    expect(await auditEvents('safety_minute.updated', id)).toHaveLength(0);
    expect(await auditEvents('safety_minute.deleted', id)).toHaveLength(0);
  });

  it('el de hoy: se edita (200), no se borra (409 SAFETY_MINUTE_LOCKED today)', async () => {
    const { id } = await createViaApi(today, 'Mensaje de hoy');
    const admin = api(context, adminToken);
    expect((await admin.get(`/safety-minutes/${id}`).expect(200)).body).toMatchObject({ editable: true, deletable: false });

    const patch = await admin.patch(`/safety-minutes/${id}`).send({ message: 'Mensaje de hoy corregido' }).expect(200);
    expect(patch.body).toMatchObject({ message: 'Mensaje de hoy corregido', editable: true, deletable: false });
    const del = await admin.delete(`/safety-minutes/${id}`).expect(409);
    expect(del.body.code).toBe('SAFETY_MINUTE_LOCKED');
    expect(del.body.details[0].reason).toBe('today');
    expect(await context.prisma.safetyMinute.count({ where: { id } })).toBe(1);

    // Y se puede mover a una fecha futura (sigue siendo editable); hoy queda libre para otro alta.
    await admin.patch(`/safety-minutes/${id}`).send({ displayDate: addDays(today, 80) }).expect(200);
    await createViaApi(today, 'Otro mensaje de hoy');
    await context.prisma.safetyMinute.deleteMany({ where: { displayDate: fromCalendarDate(today) } });
  });

  it('la lista marca editable y deletable según la fecha, calculado en el servidor', async () => {
    const pastId = await insertMinute(addDays(today, -10), 'Pasado');
    const { id: todayId } = await createViaApi(today, 'Hoy');
    const { id: futureId } = await createViaApi(addDays(today, 90), 'Futuro');
    const response = await api(context, viewerToken).get(`/safety-minutes?from=${addDays(today, -10)}&to=${addDays(today, 90)}&pageSize=100`).expect(200);
    const byId = new Map((response.body.data as Array<{ id: string; editable: boolean; deletable: boolean }>).map((row) => [row.id, row]));
    expect(byId.get(pastId)).toMatchObject({ editable: false, deletable: false });
    expect(byId.get(todayId)).toMatchObject({ editable: true, deletable: false });
    expect(byId.get(futureId)).toMatchObject({ editable: true, deletable: true });
    await context.prisma.safetyMinute.deleteMany({ where: { id: { in: [pastId, todayId] } } });
  });
});

describe('Concurrencia (PF-AJ1.21, RN-AJ1.8)', () => {
  it('dos altas simultáneas para la misma fecha: una 201 y otra 409', async () => {
    const date = addDays(today, 100);
    const responses = await Promise.all([
      api(context, adminToken).post('/safety-minutes').send({ message: 'Alta A', displayDate: date }),
      api(context, adminToken).post('/safety-minutes').send({ message: 'Alta B', displayDate: date }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const loser = responses.find((response) => response.status === 409);
    expect(loser?.body.code).toBe('SAFETY_MINUTE_DUPLICATE');
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate(date) } })).toBe(1);
    expect(await context.prisma.auditLog.count({ where: { event: 'safety_minute.created', resourceType: 'safety_minute', changes: { path: ['displayDate', 'after'], equals: date } } })).toBe(1);
  });

  it('seis altas simultáneas para la misma fecha: exactamente una 201 y las demás 409', async () => {
    const date = addDays(today, 101);
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_unused, index) => api(context, adminToken).post('/safety-minutes').send({ message: `Alta ${index}`, displayDate: date })),
    );
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409 && response.body.code === 'SAFETY_MINUTE_DUPLICATE')).toHaveLength(5);
  });
});

describe('GET /me/safety-minute (PF-AJ1.6, AC-AJ1.11, D-AJ1.9)', () => {
  it('401 sin token', async () => {
    await api(context).get('/me/safety-minute').expect(401);
  });

  it('sin mensaje hoy: 200 con safetyMinute null (la ausencia no es un error)', async () => {
    await context.prisma.safetyMinute.deleteMany({ where: { displayDate: fromCalendarDate(today) } });
    await insertMinute(addDays(today, 1), 'Mañana');
    const response = await api(context, plainToken).get('/me/safety-minute').expect(200);
    expect(response.body).toEqual({ safetyMinute: null });
    await context.prisma.safetyMinute.deleteMany({ where: { displayDate: fromCalendarDate(addDays(today, 1)) } });
  });

  it('con mensaje hoy: cualquier sesión lo ve, sin permiso adicional y sin autor ni identificadores', async () => {
    await context.prisma.safetyMinute.deleteMany({ where: { displayDate: fromCalendarDate(today) } });
    await createViaApi(today, 'Mensaje institucional de hoy');
    const response = await api(context, plainToken).get('/me/safety-minute').expect(200);
    expect(response.body).toEqual({ safetyMinute: { displayDate: today, message: 'Mensaje institucional de hoy' } });
    await context.prisma.safetyMinute.deleteMany({ where: { displayDate: fromCalendarDate(today) } });
  });

  it('el mensaje de ayer o de mañana no se muestra hoy', async () => {
    await insertMinute(addDays(today, -1), 'Ayer');
    await insertMinute(addDays(today, 1), 'Mañana');
    const response = await api(context, plainToken).get('/me/safety-minute').expect(200);
    expect(response.body).toEqual({ safetyMinute: null });
    await context.prisma.safetyMinute.deleteMany({ where: { displayDate: { in: [fromCalendarDate(addDays(today, -1)), fromCalendarDate(addDays(today, 1))] } } });
  });
});
