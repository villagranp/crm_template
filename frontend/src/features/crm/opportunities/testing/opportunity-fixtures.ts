import type {
  OpportunityCapabilities,
  OpportunityDetail,
  OpportunityFormOptions,
  OpportunityListItem,
  OpportunityStage,
} from '../opportunities.api';

/**
 * Datos de las pruebas de Oportunidades. Ficticios (nombres inventados), nunca
 * de clientes reales.
 */

export const STAGES: Record<'contactado' | 'cotizando' | 'ganado' | 'perdido', OpportunityStage> = {
  contactado: { id: 'st-contactado', code: 'CONTACTADO', label: 'Contactado', order: 1, isClosed: false, outcome: null },
  cotizando: { id: 'st-cotizando', code: 'COTIZANDO', label: 'Cotizando', order: 2, isClosed: false, outcome: null },
  ganado: { id: 'st-ganado', code: 'GANADO', label: 'Ganado', order: 3, isClosed: true, outcome: 'WON' },
  perdido: { id: 'st-perdido', code: 'PERDIDO', label: 'Perdido', order: 4, isClosed: true, outcome: 'LOST' },
};

export const OUTCOMES = [
  { id: 'oc-won', code: 'WON' as const, label: 'Ganado', stageOutcome: 'WON' as const, requiresReason: false, requiresAwardedPercent: false },
  { id: 'oc-partial', code: 'PARTIAL' as const, label: 'Parcial', stageOutcome: 'WON' as const, requiresReason: false, requiresAwardedPercent: true },
  { id: 'oc-lost', code: 'LOST' as const, label: 'Perdido', stageOutcome: 'LOST' as const, requiresReason: true, requiresAwardedPercent: false },
];

export const REASONS = [
  { id: 'rs-precio', code: 'PRECIO', label: 'Precio', appliesTo: ['LOST' as const] },
  { id: 'rs-plazo', code: 'PLAZO', label: 'Plazo de entrega', appliesTo: ['LOST' as const, 'PARTIAL' as const] },
  { id: 'rs-relacion', code: 'RELACION', label: 'Relación con el cliente', appliesTo: ['WON' as const] },
];

export const FORM_OPTIONS: OpportunityFormOptions = {
  stages: [STAGES.contactado, STAGES.cotizando, STAGES.ganado, STAGES.perdido],
  outcomes: OUTCOMES,
  reasons: REASONS,
  baseCurrencyCode: 'USD',
  defaults: { stageId: STAGES.contactado.id, opportunityDate: '2026-10-12' },
};

/** `form-options?projectId=` de un proyecto de Guatemala (AC-03.93). */
export const GT_FORM_OPTIONS: OpportunityFormOptions = {
  ...FORM_OPTIONS,
  currencies: {
    allowed: [
      { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2 },
      { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2 },
    ],
    defaultCode: 'GTQ',
  },
};

export const FULL_CAPABILITIES: OpportunityCapabilities = { canEdit: true, canClose: true, canReopen: false, canDelete: true };
export const NO_CAPABILITIES: OpportunityCapabilities = { canEdit: false, canClose: false, canReopen: false, canDelete: false };

export function listItem(overrides: Partial<OpportunityListItem> = {}): OpportunityListItem {
  return {
    id: 'o-1',
    code: 'OPO-2026-00001',
    project: { id: 'p-1', code: 'PRY-2026-00042', name: 'Torre Norte' },
    customer: { id: 'c-1', legalName: 'Constructora Peña S.A.' },
    stage: STAGES.cotizando,
    opportunityDate: '2026-10-10',
    owner: { id: 'u-1', displayName: 'Ana Asesora' },
    estimatedAmount: '7750.0000',
    currencyCode: 'GTQ',
    exchangeRate: '7.75000000',
    exchangeRateDate: '2026-10-01',
    estimatedAmountUsd: '1000.0000',
    estimatedTonnage: '120.5000',
    nextAction: 'Enviar cotización',
    nextActionDate: '2026-10-20',
    updatedAt: '2026-10-10T15:00:00.000Z',
    capabilities: FULL_CAPABILITIES,
    result: null,
    ...overrides,
  };
}

export function detail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    ...listItem(),
    description: 'Losa de cimentación',
    stageChangedAt: '2026-10-10T15:00:00.000Z',
    closedAt: null,
    result: null,
    allowedTransitions: [STAGES.contactado, STAGES.ganado, STAGES.perdido],
    productLines: 2,
    createdAt: '2026-10-10T15:00:00.000Z',
    createdBy: { id: 'u-1', displayName: 'Ana Asesora' },
    updatedBy: null,
    ...overrides,
  };
}

export function paginated<T>(items: T[], totalItems = items.length, page = 1, pageSize = 20) {
  return { data: items, pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) } };
}
