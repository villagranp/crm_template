import type { AttachmentLimits } from '@/features/crm/common/attachments.api';
import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Cliente HTTP del submódulo de Proyectos (03 §F.1, §F.4). Los tipos reflejan
 * los DTO del backend (`backend/src/modules/projects/dto`,
 * `backend/src/modules/products/dto`), nunca el modelo de datos.
 *
 * Decimales (`progress`, cantidades, factores, tonelajes) como **cadena**;
 * fechas de calendario `YYYY-MM-DD` (nunca por `new Date(cadena)`); instantes
 * ISO 8601. Los productos asociados viven en `products/project-products.api.ts`
 * y los adjuntos en `crm/common/attachments.api.ts` con `projectAttachmentsPath`.
 */

const PROJECTS_PATH = '/projects';

// ---------------------------------------------------------------------------
// Referencias
// ---------------------------------------------------------------------------

export interface UserRef {
  id: string;
  displayName: string;
}

export interface CountryRef {
  id: string;
  isoCode: string;
  name: string;
}

/** `CatalogValueDto` / `CatalogRefDto` (03 F.1). */
export interface CatalogRef {
  id: string;
  code: string;
  label: string;
}

/** Elemento de catálogo guardado en el registro; `isActive = false` = desactivado después (00 §3.5). */
export interface CatalogRefWithState extends CatalogRef {
  isActive: boolean;
}

export interface CustomerRef {
  id: string;
  legalName: string;
}

export interface TeamRef {
  id: string;
  code: string;
  name: string;
}

export type UnitDimension = 'MASS' | 'LENGTH' | 'AREA' | 'VOLUME' | 'COUNT' | 'OTHER';

/** `UnitRefDto`. */
export interface UnitRef {
  id: string;
  code: string;
  symbol: string;
  dimension: UnitDimension;
}

/** `UnitOfMeasureDto` (`/units-of-measure`, `form-options.units`). */
export interface UnitOfMeasure extends UnitRef {
  name: string;
}

export type ConversionScope = 'GLOBAL' | 'PRODUCT_FAMILY' | 'PRODUCT' | 'PROJECT_TYPE';

// ---------------------------------------------------------------------------
// Proyecto: lista, vista de equipo y ficha
// ---------------------------------------------------------------------------

/** Estado comercial derivado (RN-03.14, DEF-B). */
export type ProjectCommercialStatusKind = 'OPEN_STAGE' | 'WON' | 'LOST' | 'NO_OPPORTUNITIES';

export interface CommercialStatus {
  kind: ProjectCommercialStatusKind;
  /** Etiqueta de la etapa (`OPEN_STAGE`), `Ganado`, `Perdido` o `Sin oportunidades`. */
  label: string;
  /** Sólo en `OPEN_STAGE`. */
  stage: CatalogRef | null;
}

/**
 * Lo que el usuario puede hacer con el proyecto (RN-03.19). Lo calcula el
 * backend con la misma política que autoriza cada operación; la interfaz no
 * recalcula permisos.
 */
export interface ProjectCapabilities {
  canEdit: boolean;
  /** Además reasigna asesor y cambia el código (DM-17, DM-34). */
  canAdminister: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canCreateOpportunity: boolean;
  canEditForecast: boolean;
}

/** Fase en la lista: elemento de `crm.fase_cliente` + porcentaje (`"75.00"`). */
export interface ProjectListPhase extends CatalogRef {
  progress: string;
}

/** `ProjectListItemDto` (03 F.1; también el contrato de Clientes F-08, AC-03.86). */
export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  customer: CustomerRef;
  country: CountryRef;
  city: string | null;
  owner: UserRef;
  projectType: CatalogRef | null;
  phase: ProjectListPhase;
  commercialStatus: CommercialStatus;
  opportunityCount: number;
  estimatedDecisionDate: string | null;
  lastActivityAt: string;
  capabilities: ProjectCapabilities;
}

/** `TeamProjectItemDto` (F-14). `capabilities.canEdit = false` = "Solo lectura". */
export interface TeamProjectItem {
  id: string;
  code: string;
  name: string;
  customer: CustomerRef;
  owner: UserRef;
  /** Equipo principal del responsable. */
  team: TeamRef | null;
  phase: ProjectListPhase;
  commercialStatus: CommercialStatus;
  lastActivityAt: string;
  capabilities: ProjectCapabilities;
}

export type TonnageMode = 'RULE' | 'MANUAL' | 'NONE';

export interface ProjectConversion {
  ruleId: string;
  scope: ConversionScope;
  /** Foto del factor (8 decimales, RN-03.29). */
  factor: string;
  toUnit: { id: string; code: string };
}

/** `ProjectClassificationDto` (F-15). */
export interface ProjectClassification {
  projectType: CatalogRefWithState | null;
  sector: CatalogRefWithState | null;
  measureUnit: UnitRef | null;
  estimatedQuantity: string | null;
  tonnageMode: TonnageMode;
  conversion: ProjectConversion | null;
  estimatedTonnage: string | null;
}

export interface PhaseRef extends CatalogRef {
  order: number;
  isFinal: boolean;
}

/** `ProjectPhaseDto` (F-16). */
export interface ProjectPhase {
  phase: PhaseRef;
  progress: string;
  /** `phaseUpdatedAt` (instante). */
  updatedAt: string;
  comment: string | null;
}

export interface ProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface ProjectSummary {
  openOpportunities: number;
  wonOpportunities: number;
  partialOpportunities: number;
  lostOpportunities: number;
  productLines: number;
  attachments: number;
}

/** `ProjectDetailDto`: la lista + detalle. Aquí `phase` es `ProjectPhase` (E2a #14). */
export interface ProjectDetail extends Omit<ProjectListItem, 'phase'> {
  phase: ProjectPhase;
  address: string | null;
  description: string | null;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  classification: ProjectClassification;
  /** `null` si no es duplicado o si el origen no es visible. */
  duplicatedFrom: ProjectRef | null;
  summary: ProjectSummary;
  createdAt: string;
  createdBy: UserRef | null;
  updatedAt: string;
  updatedBy: UserRef | null;
}

// ---------------------------------------------------------------------------
// Opciones (D-03.1)
// ---------------------------------------------------------------------------

export interface ProjectCountryOption extends CountryRef {
  currencyCode: string;
}

export interface CatalogOption extends CatalogRef {
  sortOrder: number;
}

export interface PhaseOption extends CatalogOption {
  order: number;
  isFinal: boolean;
  /** Porcentaje propuesto al pasar a la fase (`"100.00"`), o `null`. */
  defaultProgress: string | null;
}

export interface StageOption extends CatalogOption {
  order: number;
  isClosed: boolean;
  outcome: 'WON' | 'LOST' | null;
}

export interface ProductStatusOption extends CatalogOption {
  /** Suma en los totales (RN-03.60). */
  isActive: boolean;
}

/** `ProjectFormOptionsDto`: toda lista de valores del módulo sale de aquí (nada fijo en el frontend). */
export interface ProjectFormOptions {
  countries: ProjectCountryOption[];
  projectTypes: CatalogOption[];
  sectors: CatalogOption[];
  /** Por `metadata.order`. */
  phases: PhaseOption[];
  /** Por `metadata.order`. */
  stages: StageOption[];
  units: UnitOfMeasure[];
  productStatuses: ProductStatusOption[];
  /** Base (`name`, `customerId`, `countryId`, `ownerId`) + `crm.campos_obligatorios.project`. */
  requiredFields: string[];
  defaults: { phaseId: string | null; stageId: string | null };
  baseCurrencyCode: string;
  /** `crm.proyectos.reglas_avance` por código de fase. */
  progressRules: Record<string, { progresoMinimo: number }>;
  tonnageUnit: { id: string; code: string; symbol: string };
  attachments: AttachmentLimits;
}

export type OwnerOptionPurpose = 'ASSIGN' | 'FILTER';

/** `OwnerOptionDto`: sin correo ni teléfono. */
export interface OwnerOption {
  id: string;
  displayName: string;
  countryId: string | null;
  primaryTeam: TeamRef | null;
}

export interface TeamOption extends TeamRef {
  parentId: string | null;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Cuerpo de `POST /projects`. Omitido = valor por defecto del backend. */
export interface CreateProjectInput {
  name: string;
  customerId: string;
  countryId?: string;
  city?: string | null;
  address?: string | null;
  description?: string | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  estimatedDecisionDate?: string | null;
  ownerId?: string;
  code?: string;
}

/** `PATCH /projects/{id}`: omitido = sin cambio; `null` = borrar un opcional. */
export type UpdateProjectInput = Partial<CreateProjectInput>;

export interface DuplicateCopyOptions {
  location: boolean;
  description: boolean;
  classification: boolean;
  products: boolean;
}

/** `DuplicateProjectDto` (F-12). Omitido = el valor del origen (o el actor, en el asesor sin `administrar`). */
export interface DuplicateProjectInput {
  name: string;
  customerId?: string;
  ownerId?: string;
  code?: string;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  estimatedDecisionDate?: string | null;
  copy: DuplicateCopyOptions;
}

/** `UpdateClassificationDto`: `PUT` que reemplaza (omitido = `null`). */
export interface UpdateClassificationInput {
  projectTypeId: string | null;
  sectorId: string | null;
  measureUnitId: string | null;
  estimatedQuantity: string | null;
  tonnageMode: TonnageMode;
  /** Sólo con `MANUAL`. */
  manualTonnage?: string;
}

export interface CreatePhaseChangeInput {
  phaseId: string;
  progress?: string;
  comment?: string | null;
}

export interface PhaseHistoryItem {
  id: string;
  fromPhase: CatalogRef | null;
  toPhase: CatalogRef;
  fromProgress: string | null;
  toProgress: string;
  comment: string | null;
  changedBy: UserRef;
  changedAt: string;
}

export const PROJECT_HISTORY_KINDS = [
  'PHASE',
  'STAGE',
  'RESULT',
  'PROJECT_DATA',
  'CLASSIFICATION',
  'PRODUCT',
  'FORECAST',
  'ATTACHMENT',
  'OPPORTUNITY_DATA',
] as const;
export type ProjectHistoryKind = (typeof PROJECT_HISTORY_KINDS)[number];

export interface ProjectHistoryChange {
  field: string;
  /** Texto libre enmascarado (`***`) en la auditoría. */
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

/** `ProjectHistoryEntryDto`. */
export interface ProjectHistoryEntry {
  id: string;
  occurredAt: string;
  actor: UserRef | null;
  kind: ProjectHistoryKind;
  /** Evento de auditoría (`crm.project.updated`…); `null` en historiales funcionales. */
  event: string | null;
  subject: { type: 'OPPORTUNITY' | 'PROJECT_PRODUCT' | 'FORECAST_LINE'; id: string; label: string } | null;
  changes: ProjectHistoryChange[];
  comment: string | null;
}

/** `ConversionRulePreviewDto` de `/unit-conversions/resolve`. */
export interface ConversionRulePreview {
  id: string;
  scope: ConversionScope;
  factor: string;
  fromUnit: { id: string; code: string; symbol: string };
  toUnit: { id: string; code: string; symbol: string };
}

export interface ConversionLookup {
  fromUnitId: string;
  productId?: string;
  projectTypeId?: string;
}

// ---------------------------------------------------------------------------
// Consultas de lista (nombres de la API, 03 F.1)
// ---------------------------------------------------------------------------

/** Lista blanca de `sortBy` de `GET /projects`. */
export const PROJECT_SORT_FIELDS = ['code', 'name', 'customerName', 'estimatedDecisionDate', 'lastActivityAt', 'createdAt', 'phaseOrder'] as const;

/**
 * Filtros de `GET /projects` aceptados en la URL (03 §E.1): los mismos nombres
 * que la API, así que Inicio y Clientes navegan con ellos y la pantalla los
 * pasa tal cual. Los de ids y `commercialStatus` son repetibles por comas.
 */
export const PROJECT_FILTER_KEYS = [
  'code',
  'customerId',
  'countryId',
  'city',
  'ownerId',
  'projectTypeId',
  'phaseId',
  'stageId',
  'commercialStatus',
  'active',
  'dateField',
  'dateFrom',
  'dateTo',
] as const;
export type ProjectFilterKey = (typeof PROJECT_FILTER_KEYS)[number];

export const PROJECT_DATE_FIELDS = ['estimatedDecisionDate', 'estimatedStartDate', 'estimatedEndDate', 'createdAt', 'lastActivityAt'] as const;
export type ProjectDateField = (typeof PROJECT_DATE_FIELDS)[number];

export const TEAM_VIEW_SORT_FIELDS = ['lastActivityAt', 'name', 'ownerName', 'teamName', 'phaseOrder'] as const;
export const TEAM_VIEW_FILTER_KEYS = ['teamId', 'ownerId', 'phaseId', 'countryId', 'lastActivityFrom', 'lastActivityTo'] as const;
export type TeamViewFilterKey = (typeof TEAM_VIEW_FILTER_KEYS)[number];

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export function projectPath(projectId: string): string {
  return `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`;
}

/** Ruta base de los adjuntos del proyecto para `AttachmentsSection` (ADR-021). */
export function projectAttachmentsPath(projectId: string): string {
  return `${projectPath(projectId)}/attachments`;
}

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

export function listProjects(query: ListQuery): Promise<PaginatedResponse<ProjectListItem>> {
  return httpClient.get<PaginatedResponse<ProjectListItem>>(PROJECTS_PATH, { query });
}

export function listTeamProjects(query: ListQuery): Promise<PaginatedResponse<TeamProjectItem>> {
  return httpClient.get<PaginatedResponse<TeamProjectItem>>(`${PROJECTS_PATH}/team-view`, { query });
}

export function getProjectFormOptions(): Promise<ProjectFormOptions> {
  return httpClient.get<ProjectFormOptions>(`${PROJECTS_PATH}/form-options`);
}

export function listOwnerOptions(query: ListQuery): Promise<PaginatedResponse<OwnerOption>> {
  return httpClient.get<PaginatedResponse<OwnerOption>>(`${PROJECTS_PATH}/owner-options`, { query });
}

export function listTeamOptions(): Promise<{ data: TeamOption[] }> {
  return httpClient.get<{ data: TeamOption[] }>(`${PROJECTS_PATH}/team-options`);
}

export function getProject(projectId: string): Promise<ProjectDetail> {
  return httpClient.get<ProjectDetail>(projectPath(projectId));
}

export function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
  return httpClient.post<ProjectDetail>(PROJECTS_PATH, { body: input });
}

export function updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectDetail> {
  return httpClient.patch<ProjectDetail>(projectPath(projectId), { body: input });
}

export function deleteProject(projectId: string): Promise<void> {
  return httpClient.delete<void>(projectPath(projectId));
}

export function duplicateProject(projectId: string, input: DuplicateProjectInput): Promise<ProjectDetail> {
  return httpClient.post<ProjectDetail>(`${projectPath(projectId)}/duplicate`, { body: input });
}

export function updateClassification(projectId: string, input: UpdateClassificationInput): Promise<ProjectClassification> {
  return httpClient.put<ProjectClassification>(`${projectPath(projectId)}/classification`, { body: input });
}

export function listPhaseHistory(projectId: string, query: ListQuery): Promise<PaginatedResponse<PhaseHistoryItem>> {
  return httpClient.get<PaginatedResponse<PhaseHistoryItem>>(`${projectPath(projectId)}/phase-history`, { query });
}

export function createPhaseChange(projectId: string, input: CreatePhaseChangeInput): Promise<ProjectPhase> {
  return httpClient.post<ProjectPhase>(`${projectPath(projectId)}/phase-changes`, { body: input });
}

export function listProjectHistory(projectId: string, query: ListQuery): Promise<PaginatedResponse<ProjectHistoryEntry>> {
  return httpClient.get<PaginatedResponse<ProjectHistoryEntry>>(`${projectPath(projectId)}/history`, { query });
}

export function listUnitsOfMeasure(): Promise<{ data: UnitOfMeasure[] }> {
  return httpClient.get<{ data: UnitOfMeasure[] }>('/units-of-measure');
}

/** Vista previa de la regla aplicable (misma precedencia que el backend; nunca un factor del frontend, AC-03.35). */
export function resolveConversion(lookup: ConversionLookup): Promise<{ rule: ConversionRulePreview | null }> {
  return httpClient.get<{ rule: ConversionRulePreview | null }>('/unit-conversions/resolve', {
    query: { fromUnitId: lookup.fromUnitId, productId: lookup.productId, projectTypeId: lookup.projectTypeId },
  });
}
