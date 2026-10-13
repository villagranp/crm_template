import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { BaseCurrencyConversion } from '@/modules/exchange-rates/currency-conversion.service';

import type { OpportunityAccessScopes } from '../opportunity-access-policy';
import { type OpportunityActor, toVisibleOpportunity } from '../opportunity-access.service';
import type { OpportunityRecord } from '../ports/opportunities.repository.port';
import type { StageItem } from '../stage-transition-policy';

import { ALL_STAGES, DEFAULT_MAP, OUTCOME_ITEMS, STAGES } from './opportunity-fixtures';

/** Puertos y servicios falsos de las pruebas unitarias de Oportunidades (excluido del build). */

export const ALL: VisibilityScope = { kind: 'ALL', userId: 'me', dataScope: 'ORGANIZATION' };
export const SCOPES: OpportunityAccessScopes = { view: ALL, administer: ALL, delete: ALL };

export function actorWith(permissions: string[], userId = 'me'): OpportunityActor {
  return { userId, permissions: new Set(permissions), audit: { correlationId: 'corr-1' } } as unknown as OpportunityActor;
}

export function record(overrides: Partial<OpportunityRecord> & { stage?: StageItem } = {}): OpportunityRecord {
  return {
    id: 'opp-1',
    code: 'OPO-2026-00001',
    project: { id: 'project-1', code: 'PRY-2026-00001', name: 'Proyecto', ownerId: 'me', countryId: 'gt' },
    customer: { id: 'customer-1', legalName: 'Cliente' },
    stage: STAGES.CONTACTADO,
    opportunityDate: '2026-10-10',
    owner: { id: 'me', displayName: 'Yo' },
    estimatedAmount: null,
    currencyCode: null,
    exchangeRate: null,
    exchangeRateDate: null,
    estimatedAmountUsd: null,
    estimatedTonnage: null,
    description: null,
    nextAction: null,
    nextActionDate: null,
    stageChangedAt: new Date('2026-10-10T12:00:00Z'),
    closedAt: null,
    result: null,
    productLines: 0,
    createdAt: new Date('2026-10-10T12:00:00Z'),
    createdBy: null,
    updatedAt: new Date('2026-10-10T12:00:00Z'),
    updatedBy: null,
    ...overrides,
  };
}

export const GTQ_CONVERSION: BaseCurrencyConversion = {
  amount: '7750.0000',
  currencyCode: 'GTQ',
  exchangeRate: '7.75000000',
  exchangeRateDate: '2026-08-01',
  amountInBaseCurrency: '1000.0000',
  baseCurrencyCode: 'USD',
  warnings: [{ code: 'EXCHANGE_RATE_STALE', message: 'm', details: { ageDays: 70 } }],
};

/** Dobles con un registro de llamadas en orden y la transacción que reciben. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- el tipo se infiere de los dobles (solo pruebas)
export function fakes(current: OpportunityRecord = record()) {
  const calls: string[] = [];
  const tx = { tx: true };
  const log =
    <T>(name: string, value: T) =>
    async (): Promise<T> => {
      calls.push(name);
      return value;
    };
  const opportunities = {
    search: jest.fn(),
    stageCounts: jest.fn(),
    findById: jest.fn(async () => current),
    lock: jest.fn(async () => {
      calls.push('lock');
      return { id: current.id, projectId: current.project.id, stageId: current.stage.id, hasResult: current.result !== null };
    }),
    create: jest.fn(log('create', 'opp-1')),
    update: jest.fn(log('update', undefined)),
    changeStage: jest.fn(log('changeStage', undefined)),
    insertStageHistory: jest.fn(log('stageHistory', undefined)),
    upsertResult: jest.fn(log('upsertResult', undefined)),
    deleteResult: jest.fn(log('deleteResult', undefined)),
    insertResultHistory: jest.fn(log('resultHistory', undefined)),
    softDelete: jest.fn(log('softDelete', undefined)),
    countDependencies: jest.fn(async () => ({ activeProducts: 0, openActivities: 0 })),
    listStageHistory: jest.fn(async () => []),
    listResultHistory: jest.fn(async () => []),
  };
  const projects = {
    lockProject: jest.fn(log('lockProject', true)),
    touchLastActivity: jest.fn(log('touch', undefined)),
    findEligibleOwner: jest.fn(async (id: string) => id),
  };
  const transactions = {
    run: jest.fn(async <T>(work: (context: unknown) => Promise<T>): Promise<T> => {
      calls.push('begin');
      const value = await work(tx);
      calls.push('commit');
      return value;
    }),
  };
  const sequences = { next: jest.fn(log('sequence', 'OPO-2026-00042')) };
  const access = {
    scopes: jest.fn(async () => SCOPES),
    findProject: jest.fn(async () => ({ id: 'project-1', owner: { id: 'me' }, country: { id: 'gt' } })),
    findVisible: jest.fn(async () => toVisibleOpportunity(current, SCOPES)),
    findEditable: jest.fn(async () => toVisibleOpportunity(current, SCOPES)),
    assignableOwners: jest.fn(() => ({ kind: 'ALL' })),
  };
  const catalogs = {
    items: jest.fn(async (key: string) => (key === 'crm.etapa_oportunidad' ? ALL_STAGES : key === 'crm.resultado_oportunidad' ? OUTCOME_ITEMS : [])),
    activeItems: jest.fn(async () => []),
  };
  const catalogValidator = { assertItem: jest.fn(async () => ({})) };
  const currencies = {
    convertToBase: jest.fn(log('convert', GTQ_CONVERSION)),
    baseCurrencyCode: jest.fn(async () => 'USD'),
    allowedCurrencies: jest.fn(),
  };
  const parameters = {
    get: jest.fn(async (key: string) => {
      if (key === 'crm.zona_horaria_negocio') return 'America/Guatemala';
      if (key === 'crm.valores_por_defecto') return { 'opportunity.stageId': 'CONTACTADO' };
      return DEFAULT_MAP;
    }),
  };
  const audit = {
    record: jest.fn<Promise<void>, [string, ...unknown[]]>(async () => {
      calls.push('audit');
    }),
  };
  const logger = { info: jest.fn() };
  return { calls, tx, opportunities, projects, transactions, sequences, access, catalogs, catalogValidator, currencies, parameters, audit, logger };
}
