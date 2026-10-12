import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { AuditService } from '@/modules/audit/audit.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';
import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import { ForecastService } from './forecast.service';
import type { ForecastLineRecord, ForecastRepository, ForecastRowRecord } from './ports/forecast.repository.port';

const TX = { tx: true } as unknown as TransactionContext;
const AUDIT = { correlationId: 'corr-1', actorId: 'user-1', actorEmail: null, ipAddress: null };
// 2026-12-15 en Guatemala: ventana enero–junio de 2027.
const NOW = new Date('2026-12-15T18:00:00.000Z');

const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a0';
const PRODUCT = '00000000-0000-4000-8000-0000000000b1';
const UNIT_ASSOC = '00000000-0000-4000-8000-0000000000c1';
const UNIT_OTHER = '00000000-0000-4000-8000-0000000000c2';
const USER = 'user-1';
const OTHER = 'user-2';

const OWN_SCOPE: VisibilityScope = { kind: 'FILTERED', userId: USER, dataScope: 'OWN', ownerIds: [USER], teamIds: [], countryIds: [] };
const TEAM_SCOPE: VisibilityScope = { kind: 'FILTERED', userId: USER, dataScope: 'TEAM', ownerIds: [USER, OTHER], teamIds: ['team'], countryIds: [] };

const RULE = { ruleId: 'rule-1', scope: 'PRODUCT' as const, factor: '0.50000000', fromUnitId: UNIT_ASSOC, toUnit: { id: 'ton', code: 'TON', symbol: 't' } };

function unit(id: string, isActive = true) {
  return { id, code: id === UNIT_ASSOC ? 'VAR' : 'KG', symbol: id === UNIT_ASSOC ? 'var' : 'kg', dimension: 'COUNT' as const, isActive };
}

function existingLine(overrides: Partial<ForecastLineRecord> = {}): ForecastLineRecord {
  return {
    id: 'line-1',
    projectId: P1,
    productId: PRODUCT,
    year: 2027,
    month: 1,
    quantity: '10.0000',
    unit: unit(UNIT_OTHER),
    conversion: null,
    tonnage: null,
    owner: { id: USER, displayName: 'Uno' },
    notes: 'nota',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-12-01T10:00:00.123Z'),
    updatedBy: null,
    ...overrides,
  };
}

function setup(options: { permissions?: string[]; view?: VisibilityScope; administer?: VisibilityScope } = {}) {
  const calls: string[] = [];
  const track =
    <T>(name: string, value: T) =>
    (...args: unknown[]) => {
      calls.push(`${name}${args.includes(TX) ? '@tx' : ''}`);
      return Promise.resolve(typeof value === 'function' ? (value as (...a: unknown[]) => unknown)(...args) : value);
    };
  const repository = {
    listRows: jest.fn(),
    listLines: jest.fn().mockResolvedValue([]),
    totals: jest.fn().mockResolvedValue([]),
    findVisibleProjects: jest.fn(track('findVisibleProjects', [{ id: P1, ownerId: USER, countryId: 'gt', projectTypeId: 'type-1' }])),
    findLines: jest.fn(track('findLines', [])),
    lockLines: jest.fn(track('lockLines', [])),
    associationUnits: jest.fn(track('associationUnits', [{ projectId: P1, productId: PRODUCT, unitId: UNIT_ASSOC }])),
    findUnits: jest.fn(track('findUnits', (ids: string[]) => ids.map((id) => unit(id)))),
    createLine: jest.fn(track('createLine', 'new-line')),
    updateLine: jest.fn(track('updateLine', undefined)),
  };
  const projects = {
    lockProject: jest.fn(track('lockProject', true)),
    touchLastActivity: jest.fn(track('touchLastActivity', undefined)),
    findEligibleOwner: jest.fn(track('findEligibleOwner', (id: string) => id)),
  };
  const transactions: TransactionRunner = {
    run: jest.fn(async <T>(work: (tx: TransactionContext) => Promise<T>) => {
      calls.push('tx:begin');
      const result = await work(TX);
      calls.push('tx:commit');
      return result;
    }) as TransactionRunner['run'],
  };
  const permissions = new Set(options.permissions ?? ['forecast.ver', 'forecast.editar']);
  const scopeResolver = {
    resolveMany: jest.fn(async (_userId: string, requested: string[]) => {
      const map = new Map<string, VisibilityScope>();
      if (requested.includes('forecast.ver')) map.set('forecast.ver', options.view ?? OWN_SCOPE);
      if (requested.includes('forecast.administrar') && options.administer) map.set('forecast.administrar', options.administer);
      return map;
    }),
  };
  const conversions = {
    resolve: jest.fn(track('resolve', (lookup: { fromUnitId: string }) => (lookup.fromUnitId === UNIT_ASSOC ? RULE : null))),
    tonnageFor: jest.fn((quantity: string) => (quantity === '10.0000' ? '5.0000' : '1.0000')),
  };
  const parameters = { get: jest.fn((key: string) => Promise.resolve(key === 'crm.forecast.horizonte_meses' ? 6 : 'America/Guatemala')) };
  const audit = { record: jest.fn(track('audit', undefined)) };
  const logger = { info: jest.fn() };
  const service = new ForecastService(
    repository as unknown as ForecastRepository,
    projects as unknown as ProjectsRepository,
    transactions,
    { now: () => NOW },
    scopeResolver as unknown as VisibilityScopeResolver,
    conversions as unknown as UnitConversionResolver,
    parameters as unknown as ParameterReader,
    audit as unknown as AuditService,
    logger as unknown as AppLogger,
  );
  const actor = { userId: USER, permissions, audit: AUDIT };
  return { service, repository, projects, conversions, audit, calls, actor, logger };
}

const LINE = { projectId: P1, productId: PRODUCT, year: 2027, month: 1, quantity: '10' };

describe('ForecastService.save (03 F.3)', () => {
  it('línea nueva: unidad de la asociación, asesor del proyecto, regla resuelta antes de la transacción, todo con tx y auditoría después', async () => {
    const { service, repository, projects, audit, calls, actor } = setup();
    const result = await service.save(actor, [LINE]);

    expect(calls).toEqual([
      'findVisibleProjects',
      'findLines',
      'associationUnits',
      'resolve',
      'tx:begin',
      'lockProject@tx',
      'associationUnits@tx',
      'lockLines@tx',
      'findUnits@tx',
      'createLine@tx',
      'touchLastActivity@tx',
      'tx:commit',
      'audit',
    ]);
    expect(repository.createLine).toHaveBeenCalledWith(
      { projectId: P1, productId: PRODUCT, year: 2027, month: 1 },
      { quantity: '10.0000', unitId: UNIT_ASSOC, conversionRuleId: 'rule-1', conversionFactor: '0.50000000', tonnage: '5.0000', ownerId: USER, notes: null },
      USER,
      expect.any(Date),
      TX,
    );
    expect(projects.touchLastActivity).toHaveBeenCalledWith([P1], expect.any(Date), TX);
    expect(result).toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      lines: [
        {
          lineId: 'new-line',
          projectId: P1,
          productId: PRODUCT,
          year: 2027,
          month: 1,
          quantity: '10.0000',
          unit: { id: UNIT_ASSOC, code: 'VAR', symbol: 'var', dimension: 'COUNT' },
          tonnage: '5.0000',
          updatedAt: expect.any(Date),
        },
      ],
    });
    expect(audit.record).toHaveBeenCalledWith('crm.forecast_line.created', AUDIT, {
      resourceType: 'crm.forecast_line',
      resourceId: 'new-line',
      before: null,
      after: { quantity: '10.0000', unitId: UNIT_ASSOC, conversionRuleId: 'rule-1', conversionFactor: '0.50000000', tonnage: '5.0000', ownerId: USER, notes: null },
      maskedFields: ['notes'],
      metadata: { projectId: P1, productId: PRODUCT, year: 2027, month: 1 },
    });
  });

  it('línea existente sin unitId conserva su unidad, asesor y notas; misma cantidad → unchanged, sin escribir ni auditar ni tocar el proyecto', async () => {
    const { service, repository, projects, audit, actor } = setup();
    repository.findLines.mockResolvedValue([existingLine()]);
    repository.lockLines.mockResolvedValue([existingLine()]);
    const result = await service.save(actor, [LINE]);
    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1, lines: [{ lineId: 'line-1', quantity: '10.0000', unit: { id: UNIT_OTHER } }] });
    expect(repository.updateLine).not.toHaveBeenCalled();
    expect(repository.createLine).not.toHaveBeenCalled();
    expect(projects.touchLastActivity).toHaveBeenCalledWith([], expect.any(Date), TX);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('3 cambiadas y 2 iguales: contadores y exactamente 3 auditorías (AC-03.80)', async () => {
    const { service, repository, audit, actor } = setup();
    const same = [1, 2].map((month) => existingLine({ id: `same-${month}`, month, quantity: '7.0000' }));
    const changed = existingLine({ id: 'changed-3', month: 3, quantity: '1.0000' });
    repository.findLines.mockResolvedValue([...same, changed]);
    repository.lockLines.mockResolvedValue([...same, changed]);
    const result = await service.save(actor, [
      { ...LINE, month: 1, quantity: '7' },
      { ...LINE, month: 2, quantity: '7.0' },
      { ...LINE, month: 3, quantity: '10' },
      { ...LINE, month: 4, quantity: '1' },
      { ...LINE, month: 5, quantity: '0' },
    ]);
    expect(result).toMatchObject({ created: 2, updated: 1, unchanged: 2 });
    expect(audit.record).toHaveBeenCalledTimes(3);
    expect(audit.record.mock.calls.map((call) => call[0])).toEqual(['crm.forecast_line.updated', 'crm.forecast_line.created', 'crm.forecast_line.created']);
    expect(audit.record.mock.calls[0]?.[2]).toMatchObject({
      resourceId: 'changed-3',
      before: { quantity: '1.0000', unitId: UNIT_OTHER, conversionRuleId: null, tonnage: null, ownerId: USER, notes: 'nota' },
      after: { quantity: '10.0000', unitId: UNIT_OTHER, conversionRuleId: null, tonnage: null, ownerId: USER, notes: 'nota' },
    });
    // updatedAt siempre avanza respecto del anterior.
    const updatedAt = repository.updateLine.mock.calls[0]?.[3] as Date;
    expect(updatedAt.getTime()).toBeGreaterThan(changed.updatedAt.getTime());
  });

  it('proyectos bloqueados en orden ascendente de id; solo se toca lastActivityAt de los que cambian', async () => {
    const { service, repository, projects, actor } = setup();
    repository.findVisibleProjects.mockResolvedValue([
      { id: P1, ownerId: USER, countryId: 'gt', projectTypeId: null },
      { id: P2, ownerId: USER, countryId: 'gt', projectTypeId: null },
    ]);
    repository.associationUnits.mockResolvedValue([
      { projectId: P1, productId: PRODUCT, unitId: UNIT_ASSOC },
      { projectId: P2, productId: PRODUCT, unitId: UNIT_ASSOC },
    ]);
    const unchanged = existingLine({ projectId: P2, quantity: '3.0000' });
    repository.lockLines.mockResolvedValue([unchanged]);
    await service.save(actor, [LINE, { ...LINE, projectId: P2, quantity: '3' }]);
    expect(projects.lockProject.mock.calls.map((call) => call[0])).toEqual([P2, P1].sort());
    expect(projects.touchLastActivity).toHaveBeenCalledWith([P1], expect.any(Date), TX);
  });

  it('validación pura primero: 422 sin leer proyectos', async () => {
    const { service, repository, actor } = setup();
    await expect(service.save(actor, [{ ...LINE, quantity: '-1' }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY', details: [{ field: 'lines[0].quantity' }] });
    expect(repository.findVisibleProjects).not.toHaveBeenCalled();
  });

  it('proyecto fuera del alcance (o eliminado): 404 RESOURCE_NOT_FOUND con el mismo cuerpo que Proyectos', async () => {
    const { service, repository, actor } = setup();
    repository.findVisibleProjects.mockResolvedValue([]);
    await expect(service.save(actor, [LINE])).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', details: [{ resource: 'Project', identifier: P1 }] });
  });

  it('proyecto ajeno visible sin forecast.administrar: 403 PERMISSION_DENIED; con administrar en su alcance: guarda', async () => {
    const foreign = [{ id: P1, ownerId: OTHER, countryId: 'gt', projectTypeId: null }];
    const denied = setup({ view: TEAM_SCOPE });
    denied.repository.findVisibleProjects.mockResolvedValue(foreign);
    await expect(denied.service.save(denied.actor, [LINE])).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      details: [{ requiredPermission: 'forecast.administrar' }],
    });
    expect(denied.repository.lockLines).not.toHaveBeenCalled();

    const outOfAdminScope = setup({ view: TEAM_SCOPE, permissions: ['forecast.ver', 'forecast.editar', 'forecast.administrar'], administer: OWN_SCOPE });
    outOfAdminScope.repository.findVisibleProjects.mockResolvedValue(foreign);
    await expect(outOfAdminScope.service.save(outOfAdminScope.actor, [LINE])).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    const admin = setup({ view: TEAM_SCOPE, permissions: ['forecast.ver', 'forecast.editar', 'forecast.administrar'], administer: TEAM_SCOPE });
    admin.repository.findVisibleProjects.mockResolvedValue(foreign);
    await expect(admin.service.save(admin.actor, [LINE])).resolves.toMatchObject({ created: 1 });
    expect(admin.repository.createLine.mock.calls[0]?.[1]).toMatchObject({ ownerId: OTHER });
  });

  it('ownerId distinto del asesor del proyecto sin administrar: 403 FIELD_NOT_EDITABLE con todas las líneas', async () => {
    const { service, actor } = setup();
    await expect(
      service.save(actor, [
        { ...LINE, ownerId: OTHER },
        { ...LINE, month: 2, ownerId: USER },
        { ...LINE, month: 3, ownerId: OTHER },
      ]),
    ).rejects.toMatchObject({
      code: 'FIELD_NOT_EDITABLE',
      details: [
        { field: 'lines[0].ownerId', requiredPermission: 'forecast.administrar' },
        { field: 'lines[2].ownerId', requiredPermission: 'forecast.administrar' },
      ],
    });
  });

  it('con administrar: asesor no asignable → 422 INVALID_OWNER; el conjunto asignable es su alcance', async () => {
    const { service, projects, actor } = setup({ permissions: ['forecast.ver', 'forecast.editar', 'forecast.administrar'], administer: TEAM_SCOPE });
    projects.findEligibleOwner.mockResolvedValue(null);
    await expect(service.save(actor, [{ ...LINE, ownerId: 'user-9' }])).rejects.toMatchObject({
      code: 'INVALID_OWNER',
      details: [{ field: 'lines[0].ownerId', code: 'INVALID_OWNER', index: 0 }],
    });
    expect(projects.findEligibleOwner).toHaveBeenCalledWith('user-9', { kind: 'FILTERED', userIds: [USER, OTHER], countryIds: [] }, 'forecast.ver');
  });

  it('dentro de la transacción: producto no asociado y unidad inactiva, todas las incidencias, nada escrito', async () => {
    const { service, repository, projects, actor } = setup();
    repository.associationUnits.mockImplementation((_pairs: unknown, tx?: unknown) =>
      Promise.resolve(tx ? [{ projectId: P1, productId: PRODUCT, unitId: UNIT_ASSOC }] : []),
    );
    repository.findUnits.mockResolvedValue([unit(UNIT_OTHER, false), unit(UNIT_ASSOC)]);
    const other = '00000000-0000-4000-8000-0000000000b2';
    await expect(service.save(actor, [{ ...LINE, unitId: UNIT_OTHER }, { ...LINE, productId: other }])).rejects.toMatchObject({
      code: 'UNKNOWN_REFERENCE',
      details: [
        { field: 'lines[0].unitId', code: 'UNKNOWN_REFERENCE', index: 0 },
        { field: 'lines[1].productId', code: 'PRODUCT_NOT_ASSOCIATED', index: 1 },
      ],
    });
    expect(repository.createLine).not.toHaveBeenCalled();
    expect(projects.touchLastActivity).not.toHaveBeenCalled();
  });

  it('unidad desactivada que la línea ya tenía y no cambia: se conserva', async () => {
    const { service, repository, actor } = setup();
    const line = existingLine({ unit: unit(UNIT_OTHER, false) });
    repository.lockLines.mockResolvedValue([line]);
    repository.findUnits.mockResolvedValue([unit(UNIT_OTHER, false)]);
    await expect(service.save(actor, [{ ...LINE, quantity: '11' }])).resolves.toMatchObject({ updated: 1 });
  });

  it('expectedUpdatedAt distinto (al milisegundo) en varias líneas: 409 FORECAST_LINE_STALE con todas y nada escrito', async () => {
    const { service, repository, projects, audit, actor } = setup();
    const first = existingLine();
    const second = existingLine({ id: 'line-2', month: 2, updatedAt: new Date('2026-12-02T00:00:00.000Z') });
    repository.lockLines.mockResolvedValue([first, second]);
    await expect(
      service.save(actor, [
        { ...LINE, quantity: '1', expectedUpdatedAt: '2026-12-01T10:00:00.122Z' },
        { ...LINE, month: 2, quantity: '1', expectedUpdatedAt: '2026-12-02T00:00:00.000Z' },
        { ...LINE, month: 3, quantity: '1', expectedUpdatedAt: '2026-12-02T00:00:00.000Z' },
      ]),
    ).rejects.toMatchObject({
      code: 'FORECAST_LINE_STALE',
      details: [
        { index: 0, lineId: 'line-1', updatedAt: '2026-12-01T10:00:00.123Z' },
        { index: 2, lineId: null, updatedAt: null },
      ],
    });
    expect(repository.updateLine).not.toHaveBeenCalled();
    expect(repository.createLine).not.toHaveBeenCalled();
    expect(projects.touchLastActivity).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('proyecto eliminado entre la lectura y el bloqueo: 404', async () => {
    const { service, projects, actor } = setup();
    projects.lockProject.mockResolvedValue(false);
    await expect(service.save(actor, [LINE])).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('regla no resuelta de antemano (la unidad cambió): se resuelve dentro de la transacción', async () => {
    const { service, repository, conversions, actor } = setup();
    repository.lockLines.mockResolvedValue([existingLine({ unit: unit(UNIT_OTHER) })]);
    await service.save(actor, [{ ...LINE, quantity: '2' }]);
    expect(conversions.resolve).toHaveBeenLastCalledWith({ fromUnitId: UNIT_OTHER, productId: PRODUCT, projectTypeId: 'type-1' }, TX);
  });
});

describe('ForecastService.rows / totals', () => {
  function row(overrides: Partial<ForecastRowRecord['project']> = {}): ForecastRowRecord {
    return {
      project: { id: P1, code: 'PRY-1', name: 'Uno', owner: { id: USER, displayName: 'Uno' }, countryId: 'gt', projectTypeId: null, visible: true, ...overrides },
      product: { id: PRODUCT, sku: 'SKU', description: 'Producto', family: { id: 'f', code: 'F', name: 'F' } },
      defaultUnit: { id: UNIT_ASSOC, code: 'VAR', symbol: 'var', dimension: 'COUNT' },
      lastUpdatedAt: null,
    };
  }

  it('filas: una celda por período; canEdit y editable de la misma política; ajeno sin administrar o no visible → solo lectura', async () => {
    const { service, repository, actor } = setup({ view: TEAM_SCOPE });
    repository.listRows.mockResolvedValue({
      items: [row(), row({ id: P2, owner: { id: OTHER, displayName: 'Dos' } }), row({ id: P2, owner: { id: USER, displayName: 'Uno' }, visible: false })],
      totalItems: 3,
      page: 1,
      pageSize: 20,
    });
    repository.listLines.mockResolvedValue([existingLine({ tonnage: '1.0000' })]);
    const page = await service.rows(actor, { mode: 'WINDOW', projectIds: [], productIds: [], ownerIds: [], page: 1, pageSize: 20, sortBy: 'projectCode', sortOrder: 'asc' });
    expect(page.items.map((item) => item.canEdit)).toEqual([true, false, false]);
    const [mine] = page.items;
    expect(mine?.cells).toHaveLength(6);
    expect(mine?.cells[0]).toMatchObject({ year: 2027, month: 1, offset: 1, editable: true, hasConversion: true, line: { id: 'line-1' } });
    expect(mine?.cells[1]).toMatchObject({ year: 2027, month: 2, line: null, hasConversion: true, editable: true });
    expect(mine?.conversion).toEqual(RULE);
    expect(mine?.totals).toMatchObject({ tonnage: '1.0000', quantitiesByUnit: [{ unit: { id: UNIT_OTHER, code: 'KG', symbol: 'kg', dimension: 'COUNT' }, quantity: '10.0000' }] });
    expect(page.items[1]?.cells.every((cell) => !cell.editable)).toBe(true);
    expect(repository.listRows).toHaveBeenCalledWith(
      expect.objectContaining({ periods: expect.arrayContaining([{ year: 2027, month: 1 }]), search: null, sortBy: 'projectCode' }),
      TEAM_SCOPE,
    );
  });

  it('historial: nada editable aunque la fila sea propia', async () => {
    const { service, repository, actor } = setup();
    repository.listRows.mockResolvedValue({ items: [row()], totalItems: 1, page: 1, pageSize: 20 });
    const page = await service.rows(actor, {
      mode: 'HISTORY',
      from: '2026-10',
      to: '2026-12',
      projectIds: [],
      productIds: [],
      ownerIds: [],
      page: 1,
      pageSize: 20,
      sortBy: 'projectCode',
      sortOrder: 'asc',
    });
    expect(page.items[0]?.canEdit).toBe(true);
    expect(page.items[0]?.cells.map((cell) => [cell.month, cell.offset, cell.editable])).toEqual([
      [10, -2, false],
      [11, -1, false],
      [12, 0, false],
    ]);
  });

  it('totales: mismos criterios normalizados y alcance de forecast.ver', async () => {
    const { service, repository, actor } = setup();
    repository.totals.mockResolvedValue([
      { year: 2027, month: 2, unit: { id: 'u', code: 'TON', symbol: 't', dimension: 'MASS' }, quantity: '3.0000', tonnage: '3.0000', lines: 2, linesWithoutConversion: 0 },
    ]);
    const totals = await service.totals(actor, { mode: 'WINDOW', periods: ['2027-02', '2027-01'], projectIds: [P1.toUpperCase()], productIds: [], ownerIds: [], search: '  Torré ' });
    expect(repository.totals).toHaveBeenCalledWith(
      {
        periods: [
          { year: 2027, month: 1 },
          { year: 2027, month: 2 },
        ],
        projectIds: [P1],
        productIds: [],
        ownerIds: [],
        search: 'torre',
      },
      OWN_SCOPE,
    );
    expect(totals.periods).toEqual([
      { year: 2027, month: 1, offset: 1, tonnage: '0.0000', accumulatedTonnage: '0.0000' },
      { year: 2027, month: 2, offset: 2, tonnage: '3.0000', accumulatedTonnage: '3.0000' },
    ]);
  });

  it('ventana con el reloj inyectado y los parámetros', async () => {
    const { service } = setup();
    const window = await service.window();
    expect(window.current).toEqual({ year: 2026, month: 12 });
    expect(window.periods.map((period) => period.label)).toEqual(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
  });
});
