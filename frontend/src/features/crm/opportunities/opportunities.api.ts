import type { CatalogRef, CustomerRef, UserRef } from '@/features/crm/projects';
import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Cliente HTTP de Oportunidades y resultados (03 §F.2, F-17, F-18). Los tipos
 * reflejan los DTO del backend (`backend/src/modules/opportunities/dto`), nunca
 * el modelo de datos.
 *
 * La estimación viaja como los cinco campos planos de DM-36 (`estimatedAmount`,
 * `currencyCode`, `exchangeRate`, `exchangeRateDate`, `estimatedAmountUsd`):
 * van juntos o ninguno. El cliente solo envía monto y moneda; la tasa, su fecha
 * y el equivalente en USD los resuelve el servidor (RN-03.79–RN-03.82).
 * Decimales como cadena; fechas de calendario `YYYY-MM-DD`.
 */

const OPPORTUNITIES_PATH = '/opportunities';

export type OpportunityOutcome = 'WON' | 'LOST' | 'PARTIAL';
/** `metadata.outcome` de una etapa cerrada. */
export type StageOutcome = 'WON' | 'LOST';

/** `OpportunityStageDto`: etapa con su semántica (DEF-A). */
export interface OpportunityStage extends CatalogRef {
  order: number;
  isClosed: boolean;
  outcome: StageOutcome | null;
}

/** Lo calcula el backend con la misma política que autoriza (E2b #2). */
export interface OpportunityCapabilities {
  /** Editar datos y pasar a etapas abiertas. */
  canEdit: boolean;
  /** Pasar a etapas cerradas y modificar el resultado. */
  canClose: boolean;
  /** Reabrir (cerrada y `oportunidades.administrar`). */
  canReopen: boolean;
  /** Eliminar (abierta y `oportunidades.eliminar`); los bloqueos llegan como `409`. */
  canDelete: boolean;
}

export interface OpportunityProjectRef {
  id: string;
  code: string;
  name: string;
}

/** Campos comunes de lista y detalle (`OpportunityCoreDto`). */
export interface OpportunityCore {
  id: string;
  code: string;
  project: OpportunityProjectRef;
  customer: CustomerRef;
  stage: OpportunityStage;
  opportunityDate: string;
  owner: UserRef;
  estimatedAmount: string | null;
  currencyCode: string | null;
  /** Unidades de la moneda por 1 USD; `1.00000000` en USD. */
  exchangeRate: string | null;
  /** Vigencia de la tasa aplicada; `null` en USD. */
  exchangeRateDate: string | null;
  estimatedAmountUsd: string | null;
  estimatedTonnage: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  updatedAt: string;
  capabilities: OpportunityCapabilities;
}

export interface OpportunityResultSummary {
  outcome: OpportunityOutcome;
  awardedPercent: string | null;
  decisionDate: string;
}

/** `OpportunityListItemDto`. */
export interface OpportunityListItem extends OpportunityCore {
  result: OpportunityResultSummary | null;
}

/** `OpportunityResultDto`: resultado vigente. */
export interface OpportunityResult {
  outcome: OpportunityOutcome;
  outcomeLabel: string;
  reason: CatalogRef | null;
  awardedPercent: string | null;
  decisionDate: string;
  comments: string | null;
  recordedBy: UserRef;
  recordedAt: string;
  updatedAt: string;
  updatedBy: UserRef | null;
}

/** `OpportunityDetailDto`. */
export interface OpportunityDetail extends OpportunityCore {
  description: string | null;
  stageChangedAt: string;
  closedAt: string | null;
  result: OpportunityResult | null;
  /** Destinos válidos para este usuario ahora (los calcula el backend). */
  allowedTransitions: OpportunityStage[];
  /** Productos asociados activos con esta oportunidad. */
  productLines: number;
  createdAt: string;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
}

export interface ExchangeRateStaleDetails {
  currencyCode: string;
  exchangeRateDate: string;
  referenceDate: string;
  ageDays: number;
  thresholdDays: number;
}

/** Aviso no bloqueante (RN-03.81): `details` es un objeto, no una lista. */
export interface OpportunityWarning {
  code: 'EXCHANGE_RATE_STALE' | (string & {});
  message: string;
  details: ExchangeRateStaleDetails;
}

/** `OpportunityMutationResponseDto` (POST/PATCH). */
export interface OpportunityMutationResponse extends OpportunityDetail {
  warnings?: OpportunityWarning[];
}

export interface StageHistoryItem {
  id: string;
  fromStage: CatalogRef | null;
  toStage: CatalogRef;
  comment: string | null;
  changedBy: UserRef;
  changedAt: string;
}

export type ResultHistoryAction = 'RECORDED' | 'CHANGED' | 'CLEARED';

export interface ResultHistoryItem {
  id: string;
  action: ResultHistoryAction;
  outcome: OpportunityOutcome | null;
  reason: CatalogRef | null;
  awardedPercent: string | null;
  decisionDate: string | null;
  comments: string | null;
  changedBy: UserRef;
  changedAt: string;
}

/** Del más reciente al más antiguo. */
export interface OpportunityHistory {
  stages: StageHistoryItem[];
  results: ResultHistoryItem[];
}

export interface StageSummary {
  stages: { stage: OpportunityStage; count: number }[];
}

// ---------------------------------------------------------------------------
// Opciones de formulario (D-03.1)
// ---------------------------------------------------------------------------

export interface OutcomeOption {
  id: string;
  code: OpportunityOutcome;
  label: string;
  /** `outcome` de la etapa cerrada que admite (RN-03.47). */
  stageOutcome: StageOutcome;
  requiresReason: boolean;
  requiresAwardedPercent: boolean;
}

export interface ReasonOption extends CatalogRef {
  /** `metadata.appliesTo`. */
  appliesTo: OpportunityOutcome[];
}

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface OpportunityFormOptions {
  /** Etapas activas por `metadata.order`. */
  stages: OpportunityStage[];
  outcomes: OutcomeOption[];
  reasons: ReasonOption[];
  baseCurrencyCode: string;
  defaults: { stageId: string; opportunityDate: string };
  /** Solo con `?projectId=`: USD y la moneda del país del proyecto (RN-03.78). */
  currencies?: { allowed: CurrencyOption[]; defaultCode: string };
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** `CreateOpportunityDto`. Omitido = valor por defecto del backend. */
export interface CreateOpportunityInput {
  stageId?: string;
  opportunityDate?: string;
  ownerId?: string;
  estimatedAmount?: string;
  currencyCode?: string;
  estimatedTonnage?: string;
  description?: string | null;
  nextAction?: string | null;
  nextActionDate?: string;
}

/** `UpdateOpportunityDto`: omitido = sin cambio; `null` borra (monto y moneda a `null` borran la estimación). */
export interface UpdateOpportunityInput {
  opportunityDate?: string;
  ownerId?: string;
  estimatedAmount?: string | null;
  currencyCode?: string | null;
  estimatedTonnage?: string | null;
  description?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
}

/** `OpportunityResultInputDto`. */
export interface OpportunityResultInput {
  outcome: OpportunityOutcome;
  reasonId?: string | null;
  awardedPercent?: string | null;
  decisionDate: string;
  comments?: string | null;
}

/** `CreateStageChangeDto`. */
export interface StageChangeInput {
  toStageId: string;
  comment?: string | null;
  result?: OpportunityResultInput;
}

// ---------------------------------------------------------------------------
// Consultas de lista (nombres de la API, 03 F.2)
// ---------------------------------------------------------------------------

export const OPPORTUNITY_SORT_FIELDS = ['code', 'opportunityDate', 'stageOrder', 'nextActionDate', 'updatedAt', 'estimatedAmountUsd'] as const;

/**
 * Filtros de `GET /opportunities` aceptados en la URL (03 §E.1): Inicio navega
 * con `?status=OPEN&outcome=WON,PARTIAL&decisionFrom=&decisionTo=` y la
 * pantalla los pasa tal cual. Los de ids y `outcome` son repetibles por comas.
 */
export const OPPORTUNITY_FILTER_KEYS = [
  'projectId',
  'customerId',
  'stageId',
  'ownerId',
  'status',
  'outcome',
  'decisionFrom',
  'decisionTo',
  'dateField',
  'dateFrom',
  'dateTo',
] as const;
export type OpportunityFilterKey = (typeof OPPORTUNITY_FILTER_KEYS)[number];

export const OPPORTUNITY_DATE_FIELDS = ['opportunityDate', 'nextActionDate', 'updatedAt'] as const;
export type OpportunityDateField = (typeof OPPORTUNITY_DATE_FIELDS)[number];

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

export function opportunityPath(opportunityId: string): string {
  return `${OPPORTUNITIES_PATH}/${encodeURIComponent(opportunityId)}`;
}

function projectOpportunitiesPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/opportunities`;
}

export function listOpportunities(query: ListQuery): Promise<PaginatedResponse<OpportunityListItem>> {
  return httpClient.get<PaginatedResponse<OpportunityListItem>>(OPPORTUNITIES_PATH, { query });
}

/** Oportunidades de un proyecto (mismos filtros salvo `projectId`; `?status=OPEN` para el Módulo 4). */
export function listProjectOpportunities(projectId: string, query: ListQuery): Promise<PaginatedResponse<OpportunityListItem>> {
  return httpClient.get<PaginatedResponse<OpportunityListItem>>(projectOpportunitiesPath(projectId), { query });
}

export function getOpportunityFormOptions(projectId?: string): Promise<OpportunityFormOptions> {
  return httpClient.get<OpportunityFormOptions>(`${OPPORTUNITIES_PATH}/form-options`, { query: { projectId } });
}

/** Conteo por etapa con los mismos filtros de la lista (cabeceras del tablero). */
export function getStageSummary(query: ListQuery): Promise<StageSummary> {
  return httpClient.get<StageSummary>(`${OPPORTUNITIES_PATH}/stage-summary`, { query });
}

export function getOpportunity(opportunityId: string): Promise<OpportunityDetail> {
  return httpClient.get<OpportunityDetail>(opportunityPath(opportunityId));
}

export function createOpportunity(projectId: string, input: CreateOpportunityInput): Promise<OpportunityMutationResponse> {
  return httpClient.post<OpportunityMutationResponse>(projectOpportunitiesPath(projectId), { body: input });
}

export function updateOpportunity(opportunityId: string, input: UpdateOpportunityInput): Promise<OpportunityMutationResponse> {
  return httpClient.patch<OpportunityMutationResponse>(opportunityPath(opportunityId), { body: input });
}

export function changeOpportunityStage(opportunityId: string, input: StageChangeInput): Promise<OpportunityDetail> {
  return httpClient.post<OpportunityDetail>(`${opportunityPath(opportunityId)}/stage-changes`, { body: input });
}

export function updateOpportunityResult(opportunityId: string, input: OpportunityResultInput): Promise<OpportunityResult> {
  return httpClient.put<OpportunityResult>(`${opportunityPath(opportunityId)}/result`, { body: input });
}

export function getOpportunityHistory(opportunityId: string): Promise<OpportunityHistory> {
  return httpClient.get<OpportunityHistory>(`${opportunityPath(opportunityId)}/history`);
}

export function deleteOpportunity(opportunityId: string): Promise<void> {
  return httpClient.delete<void>(opportunityPath(opportunityId));
}
