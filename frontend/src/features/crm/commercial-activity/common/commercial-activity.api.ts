import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Tipos y llamadas compartidos por las pantallas de Actividad comercial (04 §F).
 * Los tipos reflejan los DTO reales del backend
 * (`backend/src/modules/commercial-activity/dto/*.dto.ts`), nunca el modelo de
 * datos. Las llamadas a recursos de otros módulos (clientes, contactos,
 * proyectos y oportunidades) usan su contrato publicado (04 §F.7).
 */

// ---------------------------------------------------------------------------
// Referencias (`commercial-refs.dto.ts`)
// ---------------------------------------------------------------------------

export interface UserRef {
  id: string;
  displayName: string;
}

export interface CatalogRef {
  id: string;
  code: string;
  label: string;
}

/** Grupo derivado de la semántica del estado (RN-04.35); `OVERDUE` = actividad abierta vencida. */
export type StatusGroup = 'PENDING' | 'OVERDUE' | 'DONE' | 'CONFIRMED' | 'CANCELLED';

export interface StatusRef extends CatalogRef {
  group: StatusGroup;
}

export interface PriorityRef extends CatalogRef {
  /** `metadata.weight`: mayor peso, más arriba (RN-04.32). */
  weight: number;
}

export interface CustomerRef {
  id: string;
  crmCode: string;
  legalName: string;
}

export interface ProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface OpportunityRef {
  id: string;
  code: string;
}

/** Clasificación de una actividad abierta en la bandeja (RN-04.31). */
export type DueBucket = 'OVERDUE' | 'DUE_SOON' | 'PENDING';

export type RecordKind = 'VISIT' | 'ACTIVITY';

// ---------------------------------------------------------------------------
// Participantes (`participant.dto.ts`, RN-04.6)
// ---------------------------------------------------------------------------

export type ParticipantKind = 'CONTACT' | 'USER' | 'EXTERNAL';
export type ParticipantRole = 'INVITED' | 'ATTENDED';

export interface ParticipantDto {
  id: string;
  role: ParticipantRole;
  kind: ParticipantKind;
  contactId: string | null;
  userId: string | null;
  /** El de un contacto sólo llega con `contactos.ver` (si no, `null`). */
  displayName: string | null;
}

/** Exactamente uno de los tres sujetos. */
export interface ParticipantInput {
  contactId?: string;
  userId?: string;
  externalName?: string;
}

/** Máximo de participantes por visita o actividad (04 H.4). */
export const MAX_PARTICIPANTS = 50;
export const EXTERNAL_NAME_MAX_LENGTH = 160;

// ---------------------------------------------------------------------------
// Agenda, interacciones y seguimiento (`agenda.dto.ts`, `interaction.dto.ts`)
// ---------------------------------------------------------------------------

export interface AgendaItem {
  kind: RecordKind;
  id: string;
  code: string;
  /** RN-04.36. */
  date: string;
  endDate: string | null;
  typeLabel: string;
  /** Tipo de actividad; `null` en visitas. */
  typeId: string | null;
  subject: string;
  customer: CustomerRef;
  project: ProjectRef | null;
  owner: UserRef;
  status: StatusRef;
  isRescheduled: boolean;
  isUnregistered: boolean;
  hasReminder: boolean;
  attachmentCount: number;
  /** Ruta del detalle en el frontend. */
  detailPath: string;
}

export interface Interaction {
  sourceType: RecordKind;
  sourceId: string;
  sourceCode: string;
  occurredAt: string;
  typeLabel: string;
  typeId: string | null;
  user: UserRef;
  customer: CustomerRef;
  project: ProjectRef | null;
  opportunity: OpportunityRef | null;
  subject: string;
  summary: string | null;
  result: CatalogRef | null;
  nextAction: string | null;
  /** `YYYY-MM-DD`. */
  nextActionDate: string | null;
  /** Ruta del registro de origen en el frontend. */
  sourcePath: string;
}

export interface FollowUpSourceRef {
  sourceType: RecordKind;
  sourceId: string;
  sourceCode: string;
}

export interface FollowUpRow {
  customer: CustomerRef;
  project: ProjectRef | null;
  lastInteraction: (FollowUpSourceRef & { occurredAt: string; typeLabel: string; summary: string | null }) | null;
  nextAction: string | null;
  nextActionDate: string | null;
  nextActionSource: FollowUpSourceRef | null;
  responsible: UserRef | null;
  notes: string | null;
  attachmentCount: number;
}

export interface TraceAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  createdAt: string;
  createdBy: UserRef | null;
  ownerType: 'VISIT' | 'VISIT_EVENT' | 'ACTIVITY';
  sourceId: string;
  sourceCode: string;
  eventId: string | null;
  /** Ruta de descarga por el dueño (F.4), con la base de la API (`/api/v1/…`): se recorta con `apiRelativePath` antes de usar `httpClient`. */
  contentPath: string;
  sourcePath: string;
}

export interface FollowUpTrace {
  row: FollowUpRow;
  /** Las 50 más recientes. */
  interactions: Interaction[];
  /** Visitas pendientes y actividades abiertas desde ahora (máx. 20). */
  upcoming: AgendaItem[];
  attachments: TraceAttachment[];
}

/** Exactamente uno de los dos. */
export type FollowUpScope = { customerId: string; projectId?: undefined } | { projectId: string; customerId?: undefined };

export interface InteractionQuery {
  customerId?: string;
  projectId?: string;
  opportunityId?: string;
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
}

export function listInteractions(query: InteractionQuery): Promise<PaginatedResponse<Interaction>> {
  return httpClient.get<PaginatedResponse<Interaction>>('/interactions', { query: { ...query } });
}

export function getFollowUpTrace(scope: FollowUpScope): Promise<FollowUpTrace> {
  return httpClient.get<FollowUpTrace>('/follow-ups/trace', { query: { customerId: scope.customerId, projectId: scope.projectId } });
}

// ---------------------------------------------------------------------------
// Opciones transversales (D-04.10)
// ---------------------------------------------------------------------------

/** Usuarios activos dentro del alcance (responsable, asesor, participante interno). */
export function listOwnerOptions(query: ListQuery): Promise<PaginatedResponse<UserRef>> {
  return httpClient.get<PaginatedResponse<UserRef>>('/commercial-activity/owner-options', { query });
}

// ---------------------------------------------------------------------------
// Recursos de otros módulos (04 §F.7)
// ---------------------------------------------------------------------------

/** País para el filtro "país del cliente" (agenda, visitas, seguimiento). */
export interface CountryOptionRef {
  id: string;
  name: string;
}

/** Lo que este módulo usa de `CustomerFormOptionsDto` (02 F2): sólo la lista de países activos. */
interface CustomerFormOptionsCountries {
  countries: { id: string; name: string }[];
}

/**
 * Países activos para los filtros (04 §F.7: "la lista que publique 02 en sus
 * `form-options`"). Exige `clientes.ver`: sin él, el filtro de país no se ofrece.
 */
export async function listCountryOptions(): Promise<CountryOptionRef[]> {
  const options = await httpClient.get<CustomerFormOptionsCountries>('/customers/form-options');
  return options.countries.map((country) => ({ id: country.id, name: country.name }));
}

/** Lo que este módulo usa de `CustomerResponseDto` (02 F4) para resolver una preselección. */
export interface CustomerLookup {
  id: string;
  crmCode: string;
  legalName: string;
  country: { id: string };
}

export function getCustomerLookup(customerId: string): Promise<CustomerLookup> {
  return httpClient.get<CustomerLookup>(`/customers/${encodeURIComponent(customerId)}`);
}

/** Lo que este módulo usa de `ContactResponseDto` (02 F9). Es PII: nunca va a logs ni a almacenamiento local. */
export interface ContactLookup {
  id: string;
  fullName: string;
  jobTitle: string | null;
}

export function listCustomerContacts(customerId: string, query: ListQuery): Promise<PaginatedResponse<ContactLookup>> {
  return httpClient.get<PaginatedResponse<ContactLookup>>(`/customers/${encodeURIComponent(customerId)}/contacts`, {
    query: { ...query, status: 'ACTIVE' },
  });
}

/**
 * Lo que este módulo usa de `ProjectListItemDto` (03 F.1). El Módulo 3 vive en
 * otra rama: el tipo es propio hasta que se integre su barril público.
 */
export interface ProjectLookup {
  id: string;
  code: string;
  name: string;
  customer: { id: string; legalName: string };
}

/** `GET /projects?customerId=&search=&pageSize=` (contrato de 03). */
export function listCustomerProjectsLookup(customerId: string, query: ListQuery): Promise<PaginatedResponse<ProjectLookup>> {
  return httpClient.get<PaginatedResponse<ProjectLookup>>('/projects', { query: { ...query, customerId } });
}

/** Lo que este módulo usa de `OpportunityListItemDto` (03). */
export interface OpportunityLookup {
  id: string;
  code: string;
  name?: string | null;
  project: ProjectRef;
}

/** `GET /projects/{id}/opportunities?status=OPEN` (contrato de 03). */
export function listOpenOpportunities(projectId: string, query: ListQuery): Promise<PaginatedResponse<OpportunityLookup>> {
  return httpClient.get<PaginatedResponse<OpportunityLookup>>(`/projects/${encodeURIComponent(projectId)}/opportunities`, {
    query: { ...query, status: 'OPEN' },
  });
}

/** Ruta de la ficha del proyecto (Módulo 3). */
export function projectDetailPath(projectId: string): string {
  return `/proyectos/${encodeURIComponent(projectId)}`;
}
