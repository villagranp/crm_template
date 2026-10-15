import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import type { CurrencyConversionService } from './currency-conversion.service';
import { ExchangeRatesService, type MaintenanceActor } from './exchange-rates.service';
import type { CurrencyRecord } from './ports/exchange-rate.reader.port';
import type { ExchangeRateDetailRecord, ExchangeRateRepository } from './ports/exchange-rate.repository.port';

const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'sub-1', actorEmail: null, ipAddress: null };
const ACTOR: MaintenanceActor = { userId: 'user-1', audit: AUDIT };

const CURRENCIES: Record<string, CurrencyRecord> = {
  USD: { code: 'USD', name: 'Dólar', symbol: '$', decimals: 2, isActive: true },
  GTQ: { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2, isActive: true },
  VES: { code: 'VES', name: 'Bolívar', symbol: 'Bs', decimals: 2, isActive: false },
};

function rate(overrides: Partial<ExchangeRateDetailRecord> = {}): ExchangeRateDetailRecord {
  return {
    id: 'rate-1',
    currencyCode: 'GTQ',
    effectiveDate: '2026-10-01',
    ratePerUsd: '7.75000000',
    source: 'Banguat',
    notes: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    updatedBy: { id: 'user-1', displayName: 'Admin' },
    ...overrides,
  };
}

function setup(options: { duplicate?: boolean; existing?: ExchangeRateDetailRecord | null } = {}) {
  const repository = {
    search: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
    findById: jest.fn().mockResolvedValue(options.existing === undefined ? rate() : options.existing),
    listCurrencies: jest.fn().mockResolvedValue(Object.values(CURRENCIES)),
    findCurrency: jest.fn(async (code: string) => CURRENCIES[code] ?? null),
    create: jest.fn(async (input: Partial<ExchangeRateDetailRecord>) =>
      options.duplicate ? { ok: false as const, reason: 'DUPLICATE' as const } : { ok: true as const, record: rate({ ...input, id: 'rate-new' }) },
    ),
    update: jest.fn(async (_id: string, input: Partial<ExchangeRateDetailRecord>) => rate({ ...input })),
  } as unknown as jest.Mocked<ExchangeRateRepository>;
  const currencies = { baseCurrencyCode: jest.fn().mockResolvedValue('USD') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ExchangeRatesService(repository, currencies as unknown as CurrencyConversionService, audit as unknown as AuditService);
  return { service, repository, audit };
}

const CREATE = { currencyCode: 'GTQ', effectiveDate: '2026-10-01', ratePerUsd: '7.75', source: 'Banguat' };

describe('ExchangeRatesService (07 F.7, RN-07.44)', () => {
  it('search: defectos effectiveDate desc y filtros nulos', async () => {
    const { service, repository } = setup();
    await service.search({ page: 1, pageSize: 20 });
    expect(repository.search).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      currencyCode: null,
      from: null,
      to: null,
      sortBy: 'effectiveDate',
      sortOrder: 'desc',
    });
  });

  it('create: normaliza la tasa a 8 decimales, guarda quién y audita crm.exchange_rate.created', async () => {
    const { service, repository, audit } = setup();
    const created = await service.create({ ...CREATE, notes: 'Cierre de septiembre' }, ACTOR);
    expect(repository.create).toHaveBeenCalledWith(
      { currencyCode: 'GTQ', effectiveDate: '2026-10-01', ratePerUsd: '7.75000000', source: 'Banguat', notes: 'Cierre de septiembre' },
      'user-1',
    );
    expect(created.id).toBe('rate-new');
    expect(audit.record).toHaveBeenCalledWith('crm.exchange_rate.created', AUDIT, expect.objectContaining({
      resourceType: 'crm.exchange_rate',
      resourceId: 'rate-new',
      before: null,
      after: expect.objectContaining({ currencyCode: 'GTQ', ratePerUsd: '7.75000000' }),
    }));
  });

  it.each([
    ['USD', '7.75', 'base_currency'],
    ['XXX', '7.75', 'unknown_currency'],
    ['VES', '7.75', 'inactive_currency'],
    ['GTQ', '0', 'non_positive_rate'],
    ['GTQ', '-3', 'non_positive_rate'],
  ])('create %s con tasa %s → 422 INVALID_EXCHANGE_RATE (%s)', async (currencyCode, ratePerUsd, issue) => {
    const { service, repository, audit } = setup();
    await expect(service.create({ ...CREATE, currencyCode, ratePerUsd }, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_EXCHANGE_RATE',
      details: [expect.objectContaining({ issue })],
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('create duplicada → 409 EXCHANGE_RATE_DUPLICATE sin auditoría', async () => {
    const { service, audit } = setup({ duplicate: true });
    await expect(service.create(CREATE, ACTOR)).rejects.toMatchObject({ code: 'EXCHANGE_RATE_DUPLICATE' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('update: corrige tasa, fuente y notas y audita antes/después', async () => {
    const { service, repository, audit } = setup();
    await service.update('rate-1', { ratePerUsd: '7.8', source: 'Tesorería', notes: 'corrección' }, ACTOR);
    expect(repository.update).toHaveBeenCalledWith('rate-1', { ratePerUsd: '7.80000000', source: 'Tesorería', notes: 'corrección' }, 'user-1');
    expect(audit.record).toHaveBeenCalledWith('crm.exchange_rate.updated', AUDIT, expect.objectContaining({
      before: expect.objectContaining({ ratePerUsd: '7.75000000', source: 'Banguat', notes: null }),
      after: expect.objectContaining({ ratePerUsd: '7.80000000', source: 'Tesorería', notes: 'corrección' }),
      metadata: { currencyCode: 'GTQ', effectiveDate: '2026-10-01' },
    }));
  });

  it('update sin cambios reales: no escribe ni audita', async () => {
    const { service, repository, audit } = setup();
    const result = await service.update('rate-1', { ratePerUsd: '7.750', source: 'Banguat' }, ACTOR);
    expect(result.id).toBe('rate-1');
    expect(repository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('update: inexistente → 404; tasa ≤ 0 → 422', async () => {
    await expect(setup({ existing: null }).service.update('nope', { source: 'x' }, ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(setup().service.update('rate-1', { ratePerUsd: '0' }, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_EXCHANGE_RATE',
      details: [{ field: 'ratePerUsd', issue: 'non_positive_rate' }],
    });
  });
});
