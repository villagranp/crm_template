import type { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';

import type { LocalCurrencyReferenceService } from './local-currency-reference';
import { decisionDateOf, OpportunityReportService } from './opportunity-report.service';
import type { OpportunityReportRecord } from './ports/reporting.repository.port';
import { fakeMetrics, fakeReporting, page, REPORT_CONTEXT, SEMANTICS } from './testing/report-fixtures';

function record(overrides: Partial<OpportunityReportRecord> = {}): OpportunityReportRecord {
  return {
    id: 'o1',
    code: 'OPO-1',
    project: { id: 'p1', code: 'PRY-1', name: 'Proyecto' },
    customer: { id: 'c1', name: 'Cliente' },
    owner: { id: 'user-1', displayName: 'Asesor' },
    stage: { id: 'stage-won', label: 'Ganado' },
    result: { outcome: 'PARTIAL', reason: null, awardedPercent: '60.00', decisionDate: '2026-10-05' },
    estimate: { amount: null, currencyCode: null, exchangeRate: null, exchangeRateDate: null, amountUsd: null, tonnage: null },
    projectEstimatedDecisionDate: '2026-12-01',
    updatedAt: new Date('2026-10-06T00:00:00Z'),
    ...overrides,
  };
}

function build() {
  const metrics = fakeMetrics({
    countOpportunities: jest.fn().mockResolvedValue({ total: 2, open: 1, won: 1, wonFull: 0, partial: 1, lost: 0, closedWithoutResult: 0, amountUsd: '1500.0000', tonnage: '3.0000' }),
    stageDistribution: jest.fn().mockResolvedValue([]),
    ownerDistribution: jest.fn().mockResolvedValue([]),
  });
  const reporting = fakeReporting({ opportunityRows: jest.fn().mockResolvedValue(page([record(), record({ id: 'o2', stage: { id: 'stage-open', label: 'Contactado' }, result: null })])) });
  const local = { resolve: jest.fn().mockResolvedValue({ reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' }) } as unknown as jest.Mocked<LocalCurrencyReferenceService>;
  const currencies = { baseCurrencyCode: jest.fn().mockResolvedValue('USD') } as unknown as jest.Mocked<CurrencyConversionService>;
  return { service: new OpportunityReportService(metrics, reporting, local, currencies), metrics, reporting, local };
}

describe('OpportunityReportService (F-35)', () => {
  it('RN-05.28: fecha de decisión real con resultado; si no, la estimada del proyecto; si no hay ninguna, null', () => {
    expect(decisionDateOf({ result: record().result, projectEstimatedDecisionDate: '2026-12-01' })).toEqual({ decisionDate: '2026-10-05', decisionDateKind: 'ACTUAL' });
    expect(decisionDateOf({ result: null, projectEstimatedDecisionDate: '2026-12-01' })).toEqual({ decisionDate: '2026-12-01', decisionDateKind: 'ESTIMATED' });
    expect(decisionDateOf({ result: null, projectEstimatedDecisionDate: null })).toEqual({ decisionDate: null, decisionDateKind: null });
  });

  it('la lista pide el orden por defecto con el ranking de etapas y añade `isClosed` por la semántica', async () => {
    const { service, reporting } = build();
    const result = await service.list(REPORT_CONTEXT, { page: 1, pageSize: 20 });
    expect(reporting.opportunityRows).toHaveBeenCalledWith(expect.objectContaining({ scope: REPORT_CONTEXT.scope, openStageIds: ['stage-open'], period: null }), {
      page: 1,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      stageRanking: SEMANTICS.stages.map((stage) => stage.id),
    });
    expect(result.items.map((row) => [row.id, row.stage.isClosed, row.decisionDateKind, row.result])).toEqual([
      ['o1', true, 'ACTUAL', { outcome: 'PARTIAL', reason: null, awardedPercent: '60.00' }],
      ['o2', false, 'ESTIMATED', null],
    ]);
  });

  it('el resumen usa el mismo criterio para conteos y distribuciones y pide la referencia local con el `to` del período', async () => {
    const { service, metrics, local } = build();
    const summary = await service.summary(REPORT_CONTEXT, { from: '2026-10-01', to: '2026-10-31', countryId: ['gt'] });
    const criteria = metrics.countOpportunities.mock.calls[0]?.[0];
    expect(metrics.stageDistribution).toHaveBeenCalledWith(criteria, SEMANTICS);
    expect(metrics.ownerDistribution).toHaveBeenCalledWith(criteria);
    expect(criteria).toMatchObject({ countryIds: ['gt'], period: { basis: 'IDENTIFIED', window: { from: '2026-10-01', to: '2026-10-31' } } });
    expect(local.resolve).toHaveBeenCalledWith({ filterCountryIds: ['gt'], scope: REPORT_CONTEXT.scope, totalUsd: '1500.0000', periodTo: '2026-10-31', clock: REPORT_CONTEXT });
    expect(summary).toMatchObject({
      total: 2,
      won: 1,
      partial: 1,
      estimateTotals: { amountUsd: '1500.0000', currencyCode: 'USD', tonnage: '3.0000', local: { reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' } },
    });
  });
});
