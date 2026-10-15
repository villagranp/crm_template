import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Consulta y exportación de la bitácora (PLAN-ADMIN, D11 y D13), con el filtro
 * `field` y la exportación `layout=fields` (07-administracion F.6, D-07.10).
 *
 * Los registros de cada prueba llevan un prefijo de evento único: la bitácora
 * es compartida y nunca se comprueban totales globales.
 */

let ctx: TestContext;
let auditorToken: string;
let prefix: string;
const resourceId = randomUUID();

function api() {
  return request(ctx.app.getHttpServer());
}

beforeAll(async () => {
  ctx = await createTestContext();
  auditorToken = (await tokenWithRoles(ctx, ['auditor'])).token;

  prefix = `prueba${randomUUID().slice(0, 8)}.`;
  await ctx.prisma.auditLog.createMany({
    data: [
      {
        event: `${prefix}created`,
        correlationId: 'corr-a',
        subjectId: 'actor-1',
        subjectEmail: 'ana.auditada@integration.test',
        resourceType: 'role',
        resourceId,
        changes: { name: { before: null, after: 'A' } },
        occurredAt: new Date('2026-01-10T10:00:00.000Z'),
      },
      {
        event: `${prefix}updated`,
        correlationId: 'corr-b',
        subjectId: 'actor-2',
        subjectEmail: 'beto.auditado@integration.test',
        resourceType: 'role',
        resourceId,
        changes: { name: { before: 'A', after: '=B' } },
        metadata: { reason: 'prueba' },
        occurredAt: new Date('2026-01-11T10:00:00.000Z'),
      },
    ],
  });
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('GET /api/v1/audit-logs', () => {
  it('200: filtra por prefijo de evento, más recientes primero, con changes y metadata tal cual', async () => {
    const response = await api()
      .get('/api/v1/audit-logs')
      .query({ event: prefix })
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200);

    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(response.body.data.map((row: { event: string }) => row.event)).toEqual([`${prefix}updated`, `${prefix}created`]);
    expect(response.body.data[0]).toMatchObject({
      subjectEmail: 'beto.auditado@integration.test',
      resourceType: 'role',
      resourceId,
      changes: { name: { before: 'A', after: '=B' } },
      metadata: { reason: 'prueba' },
      occurredAt: '2026-01-11T10:00:00.000Z',
    });
  });

  it('combina evento exacto, actor, recurso, correlación y fechas', async () => {
    const base = { event: prefix };
    const cases: [Record<string, string>, string[]][] = [
      [{ event: `${prefix}created` }, [`${prefix}created`]],
      [{ ...base, search: 'BETO.auditado' }, [`${prefix}updated`]],
      [{ ...base, subjectId: 'actor-1' }, [`${prefix}created`]],
      [{ ...base, resourceType: 'role', resourceId }, [`${prefix}updated`, `${prefix}created`]],
      [{ ...base, correlationId: 'corr-a' }, [`${prefix}created`]],
      [{ ...base, from: '2026-01-11', to: '2026-01-11' }, [`${prefix}updated`]],
      [{ ...base, to: '2026-01-10' }, [`${prefix}created`]],
    ];

    for (const [query, expected] of cases) {
      const response = await api().get('/api/v1/audit-logs').query(query).set('Authorization', `Bearer ${auditorToken}`).expect(200);
      expect(response.body.data.map((row: { event: string }) => row.event)).toEqual(expected);
    }
  });

  it('ordena por fecha ascendente y pagina', async () => {
    const response = await api()
      .get('/api/v1/audit-logs')
      .query({ event: prefix, sortBy: 'occurredAt', sortOrder: 'asc', pageSize: 1, page: 2 })
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200);

    expect(response.body.data.map((row: { event: string }) => row.event)).toEqual([`${prefix}updated`]);
    expect(response.body.pagination).toMatchObject({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/audit-logs').expect(401);
  });

  it('403 sin auditoria.ver', async () => {
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get('/api/v1/audit-logs').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it.each([
    [{ from: 'ayer' }],
    [{ from: '2026-01-12', to: '2026-01-11' }],
    [{ sortBy: 'subjectEmail' }],
    [{ pageSize: 101 }],
    [{ desconocido: 'x' }],
  ])('400 con filtros inválidos %j', async (query) => {
    await api().get('/api/v1/audit-logs').query(query).set('Authorization', `Bearer ${auditorToken}`).expect(400);
  });
});

describe('GET /api/v1/audit-logs/events', () => {
  it('200: incluye los nombres de evento registrados', async () => {
    const response = await api().get('/api/v1/audit-logs/events').set('Authorization', `Bearer ${auditorToken}`).expect(200);
    expect(response.body.data).toEqual(expect.arrayContaining([`${prefix}created`, `${prefix}updated`]));
  });

  it('403 sin auditoria.ver', async () => {
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get('/api/v1/audit-logs/events').set('Authorization', `Bearer ${token}`).expect(403);
  });
});

describe('GET /api/v1/audit-logs/export', () => {
  it('200: CSV con los filtros, sin fórmulas ejecutables, y la exportación queda auditada', async () => {
    const { user, token } = await tokenWithRoles(ctx, ['auditor']);

    const response = await api()
      .get('/api/v1/audit-logs/export')
      .query({ event: prefix })
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => callback(null, body));
      })
      .expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="auditoria-\d{8}-\d{4}\.csv"$/);
    expect(response.headers['x-export-truncated']).toBe('false');
    expect(response.headers['cache-control']).toBe('no-store');

    const lines = (response.body as string).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Fecha (UTC),Evento,Correo del actor,Id del actor,Tipo de recurso,Id del recurso,IP,Correlación,Cambios,Metadatos');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(`${prefix}updated`);
    expect(lines[1]).toContain('""after"":""=B""');
    expect(lines[2]).toContain(`${prefix}created`);

    const exported = await ctx.prisma.auditLog.findFirst({
      where: { event: 'audit_log.exported', subjectEmail: user.email },
    });
    expect(exported?.metadata).toEqual({ 'filter.event': prefix, layout: 'events', rows: 2, truncated: false });
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/audit-logs/export').expect(401);
  });

  it('403 con auditoria.ver pero sin auditoria.exportar', async () => {
    const { token } = await tokenWithRoles(ctx, ['gestor-accesos']);
    await api().get('/api/v1/audit-logs/export').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('400 con paginación (la exportación no la acepta) o fechas inválidas', async () => {
    await api().get('/api/v1/audit-logs/export').query({ page: 1 }).set('Authorization', `Bearer ${auditorToken}`).expect(400);
    await api()
      .get('/api/v1/audit-logs/export')
      .query({ from: '2026-02-01', to: '2026-01-01' })
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(400);
  });
});

/** Exportación con el cuerpo como texto (supertest no parsea CSV). */
function exportCsv(query: Record<string, string>, token: string) {
  return api()
    .get('/api/v1/audit-logs/export')
    .query(query)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse((res, callback) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => callback(null, body));
    });
}

function csvLines(body: string): string[] {
  return body.replace(/^\uFEFF/, '').trim().split('\r\n');
}

describe('filtro por campo y vista por campo (D-07.10)', () => {
  let fieldPrefix: string;
  const projectId = randomUUID();

  beforeAll(async () => {
    fieldPrefix = `campo${randomUUID().slice(0, 8)}.`;
    await ctx.prisma.auditLog.createMany({
      data: [
        {
          event: `${fieldPrefix}phase_changed`,
          correlationId: 'corr-f1',
          subjectId: 'actor-f',
          subjectEmail: 'fase.auditada@integration.test',
          resourceType: 'crm.project',
          resourceId: projectId,
          changes: { phaseId: { before: 'f-1', after: 'f-2' }, phaseProgress: { before: 10, after: 40 } },
          occurredAt: new Date('2026-02-10T10:00:00.000Z'),
        },
        {
          event: `${fieldPrefix}updated`,
          correlationId: 'corr-f2',
          subjectId: 'actor-f',
          subjectEmail: 'fase.auditada@integration.test',
          resourceType: 'crm.project',
          resourceId: projectId,
          changes: { name: { before: 'Torre A', after: 'Torre B' } },
          occurredAt: new Date('2026-02-11T10:00:00.000Z'),
        },
        {
          // Registro antiguo: un valor sin la forma { before, after } (RN-07.42).
          event: `${fieldPrefix}legacy`,
          correlationId: 'corr-f3',
          subjectId: 'actor-g',
          subjectEmail: null,
          resourceType: 'crm.project',
          resourceId: projectId,
          changes: { phaseId: ['f-0', 'f-1'] },
          occurredAt: new Date('2026-02-09T10:00:00.000Z'),
        },
        {
          // Sin `changes`: nunca casa con `field`.
          event: `${fieldPrefix}viewed`,
          correlationId: 'corr-f4',
          subjectId: 'actor-f',
          resourceType: 'crm.project',
          resourceId: projectId,
          occurredAt: new Date('2026-02-12T10:00:00.000Z'),
        },
      ],
    });
  });

  it('GET ?field= deja solo los eventos cuyo changes contiene esa clave', async () => {
    const response = await api()
      .get('/api/v1/audit-logs')
      .query({ event: fieldPrefix, field: 'phaseId' })
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200);

    expect(response.body.data.map((row: { event: string }) => row.event)).toEqual([`${fieldPrefix}phase_changed`, `${fieldPrefix}legacy`]);
    expect(response.body.pagination).toMatchObject({ totalItems: 2 });
  });

  it('AC-07.34: field se combina con entidad, registro, acción, usuario y fechas', async () => {
    const cases: [Record<string, string>, string[]][] = [
      [{ event: `${fieldPrefix}phase_changed`, field: 'phaseId' }, [`${fieldPrefix}phase_changed`]],
      [{ event: fieldPrefix, field: 'name', resourceType: 'crm.project', resourceId: projectId }, [`${fieldPrefix}updated`]],
      [{ event: fieldPrefix, field: 'phaseId', subjectId: 'actor-g' }, [`${fieldPrefix}legacy`]],
      [{ event: fieldPrefix, field: 'phaseId', search: 'fase.auditada' }, [`${fieldPrefix}phase_changed`]],
      [{ event: fieldPrefix, field: 'phaseId', from: '2026-02-10', to: '2026-02-12' }, [`${fieldPrefix}phase_changed`]],
      [{ event: fieldPrefix, field: 'phaseId', resourceType: 'role' }, []],
      [{ event: fieldPrefix, field: 'noExiste' }, []],
    ];

    for (const [query, expected] of cases) {
      const response = await api().get('/api/v1/audit-logs').query(query).set('Authorization', `Bearer ${auditorToken}`).expect(200);
      expect(response.body.data.map((row: { event: string }) => row.event)).toEqual(expected);
    }
  });

  it('un campo con caracteres de SQL o de comodín no casa nada raro: se valida y viaja como parámetro', async () => {
    // `%`, `?` y comillas están fuera de [A-Za-z0-9_.]: 400 antes de llegar a la base.
    for (const field of ["phaseId' OR '1'='1", 'phase%', 'phase?', 'a b', '', 'x'.repeat(101)]) {
      await api().get('/api/v1/audit-logs').query({ field }).set('Authorization', `Bearer ${auditorToken}`).expect(400);
    }
    // `_` y `.` son válidos y se comparan literalmente (no como comodines de LIKE).
    const response = await api()
      .get('/api/v1/audit-logs')
      .query({ event: fieldPrefix, field: 'phase_d' })
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200);
    expect(response.body.data).toEqual([]);
  });

  it('PF-07.39: 401 sin token y 403 sin auditoria.ver también con field', async () => {
    await api().get('/api/v1/audit-logs').query({ field: 'phaseId' }).expect(401);
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get('/api/v1/audit-logs').query({ field: 'phaseId' }).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('AC-07.36: exportación layout=fields, una fila por campo con sus columnas, y queda auditada', async () => {
    const { user, token } = await tokenWithRoles(ctx, ['auditor']);

    const response = await exportCsv({ event: fieldPrefix, layout: 'fields' }, token).expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers['x-export-truncated']).toBe('false');
    const lines = csvLines(response.body as string);
    expect(lines[0]).toBe('Fecha (UTC),Usuario,Entidad,Registro,Acción,Campo,Valor anterior,Valor nuevo');
    expect(lines.slice(1)).toEqual([
      `2026-02-12T10:00:00.000Z,actor-f,crm.project,${projectId},${fieldPrefix}viewed,,,`,
      `2026-02-11T10:00:00.000Z,fase.auditada@integration.test,crm.project,${projectId},${fieldPrefix}updated,name,Torre A,Torre B`,
      `2026-02-10T10:00:00.000Z,fase.auditada@integration.test,crm.project,${projectId},${fieldPrefix}phase_changed,phaseId,f-1,f-2`,
      `2026-02-10T10:00:00.000Z,fase.auditada@integration.test,crm.project,${projectId},${fieldPrefix}phase_changed,phaseProgress,10,40`,
      `2026-02-09T10:00:00.000Z,actor-g,crm.project,${projectId},${fieldPrefix}legacy,phaseId,,"[""f-0"",""f-1""]"`,
    ]);

    const exported = await ctx.prisma.auditLog.findFirst({ where: { event: 'audit_log.exported', subjectEmail: user.email } });
    // `rows` cuenta eventos (el tope de 10 000 es de eventos), no filas de campo.
    expect(exported?.metadata).toEqual({ 'filter.event': fieldPrefix, layout: 'fields', rows: 4, truncated: false });
  });

  it('exportación layout=fields con field: solo ese campo de los eventos que lo cambiaron', async () => {
    const response = await exportCsv({ event: fieldPrefix, layout: 'fields', field: 'phaseId' }, auditorToken).expect(200);

    const lines = csvLines(response.body as string);
    expect(lines.slice(1).map((line) => line.split(',')[5])).toEqual(['phaseId', 'phaseId']);
  });

  it('exportación con field y layout por defecto (events): formato histórico, solo los eventos con ese campo', async () => {
    const response = await exportCsv({ event: fieldPrefix, field: 'name' }, auditorToken).expect(200);

    const lines = csvLines(response.body as string);
    expect(lines[0]).toMatch(/^Fecha \(UTC\),Evento,/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`${fieldPrefix}updated`);
  });

  it('400 con layout desconocido o field inválido en la exportación', async () => {
    await api().get('/api/v1/audit-logs/export').query({ layout: 'rows' }).set('Authorization', `Bearer ${auditorToken}`).expect(400);
    await api().get('/api/v1/audit-logs/export').query({ field: 'a;b' }).set('Authorization', `Bearer ${auditorToken}`).expect(400);
  });

  it('PF-07.39: 401 sin token y 403 sin auditoria.exportar con layout=fields', async () => {
    await api().get('/api/v1/audit-logs/export').query({ layout: 'fields' }).expect(401);
    const { token } = await tokenWithRoles(ctx, ['gestor-accesos']);
    await api().get('/api/v1/audit-logs/export').query({ layout: 'fields' }).set('Authorization', `Bearer ${token}`).expect(403);
  });
});
