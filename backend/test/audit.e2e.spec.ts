import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Consulta y exportación de la bitácora (PLAN-ADMIN, D11 y D13).
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
    expect(exported?.metadata).toEqual({ 'filter.event': prefix, rows: 2, truncated: false });
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
