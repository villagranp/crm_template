import type { DashboardComposition } from '@/services/ui-settings';

/**
 * Metadatos de los editores estructurados de parámetros JSON (07 E.4).
 *
 * Reflejan el registro de reglas del backend
 * (`backend/src/modules/parameters/parameter-rules.registry.ts`): la lista
 * blanca de campos obligatorios, los campos con valor por defecto y su
 * catálogo, los tipos de alerta y las acciones de duplicidad. Esos NO los
 * expone la API, así que se copian aquí; si cambian allí y no aquí, el backend
 * responde `422 INVALID_PARAMETER_VALUE` con el motivo, que el diálogo muestra.
 * La excepción es `dashboard-cards`: sus listas cerradas llegan en
 * `editorOptions` de `GET /parameters` y no se copian. Los nombres legibles
 * son de presentación.
 */

export interface RequiredFieldsEntity {
  label: string;
  /** Obligatorios de base: siempre incluidos, no se pueden quitar (RN-07.31). */
  base: readonly string[];
  allowed: readonly string[];
}

export const REQUIRED_FIELDS_ENTITIES: Readonly<Record<string, RequiredFieldsEntity>> = {
  customer: {
    label: 'Cliente',
    base: ['legalName', 'countryId', 'statusId', 'salesOwnerId'],
    allowed: [
      'customerCode',
      'legalName',
      'tradeName',
      'taxId',
      'countryId',
      'city',
      'address',
      'phone',
      'email',
      'companyTypeId',
      'statusId',
      'ratingId',
      'salesOwnerId',
      'primaryContactId',
    ],
  },
  project: {
    label: 'Proyecto',
    base: ['name', 'customerId', 'countryId', 'ownerId'],
    allowed: [
      'name',
      'customerId',
      'countryId',
      'city',
      'address',
      'description',
      'estimatedStartDate',
      'estimatedEndDate',
      'estimatedDecisionDate',
      'ownerId',
      'projectTypeId',
      'sectorId',
      'measureUnitId',
      'estimatedQuantity',
      'phaseId',
      'phaseProgress',
    ],
  },
  visit: {
    label: 'Visita',
    base: ['customerId', 'scheduledStartAt', 'ownerId', 'objective'],
    allowed: [
      'customerId',
      'projectId',
      'ownerId',
      'scheduledStartAt',
      'scheduledEndAt',
      'objective',
      'location',
      'reminderMinutesBefore',
      'participants',
    ],
  },
  activity: {
    label: 'Actividad',
    base: ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'],
    allowed: [
      'typeId',
      'subject',
      'description',
      'customerId',
      'projectId',
      'opportunityId',
      'ownerId',
      'priorityId',
      'scheduledAt',
      'dueAt',
      'durationMinutes',
      'summary',
      'participants',
    ],
  },
  visitCompletion: {
    label: 'Registro de visita realizada',
    base: ['actualStartAt'],
    allowed: [
      'actualStartAt',
      'actualEndAt',
      'topics',
      'agreements',
      'resultId',
      'resultSummary',
      'comments',
      'nextAction',
      'nextActionDate',
      'participants',
    ],
  },
};

/** Nombres legibles de los campos (los que no figuran se muestran por su nombre técnico). */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  customerCode: 'Código de cliente',
  legalName: 'Razón social',
  tradeName: 'Nombre comercial',
  taxId: 'NIT',
  countryId: 'País',
  city: 'Ciudad',
  address: 'Dirección',
  phone: 'Teléfono',
  email: 'Correo',
  companyTypeId: 'Tipo de empresa',
  statusId: 'Estado',
  ratingId: 'Calificación',
  salesOwnerId: 'Asesor responsable',
  primaryContactId: 'Contacto principal',
  name: 'Nombre',
  customerId: 'Cliente',
  description: 'Descripción',
  estimatedStartDate: 'Inicio estimado',
  estimatedEndDate: 'Fin estimado',
  estimatedDecisionDate: 'Fecha estimada de decisión',
  ownerId: 'Responsable',
  projectTypeId: 'Tipo de proyecto',
  sectorId: 'Sector',
  measureUnitId: 'Unidad de medida',
  estimatedQuantity: 'Cantidad estimada',
  phaseId: 'Fase',
  phaseProgress: 'Avance de fase',
  projectId: 'Proyecto',
  scheduledStartAt: 'Inicio programado',
  scheduledEndAt: 'Fin programado',
  objective: 'Objetivo',
  location: 'Lugar',
  reminderMinutesBefore: 'Recordatorio',
  participants: 'Participantes',
  typeId: 'Tipo',
  subject: 'Asunto',
  opportunityId: 'Oportunidad',
  priorityId: 'Prioridad',
  scheduledAt: 'Fecha programada',
  dueAt: 'Vencimiento',
  durationMinutes: 'Duración',
  summary: 'Resumen',
  actualStartAt: 'Inicio real',
  actualEndAt: 'Fin real',
  topics: 'Temas tratados',
  agreements: 'Acuerdos',
  resultId: 'Resultado',
  resultSummary: 'Resumen del resultado',
  comments: 'Comentarios',
  nextAction: 'Siguiente acción',
  nextActionDate: 'Fecha de la siguiente acción',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** `crm.valores_por_defecto`: campo → catálogo cuyo código admite. */
export const DEFAULT_VALUE_FIELDS: readonly { field: string; label: string; catalogKey: string }[] =
  [
    { field: 'customer.statusId', label: 'Cliente · Estado', catalogKey: 'crm.estado_cliente' },
    {
      field: 'customer.companyTypeId',
      label: 'Cliente · Tipo de empresa',
      catalogKey: 'crm.tipo_empresa',
    },
    {
      field: 'customer.ratingId',
      label: 'Cliente · Calificación',
      catalogKey: 'crm.calificacion_cliente',
    },
    { field: 'project.phaseId', label: 'Proyecto · Fase', catalogKey: 'crm.fase_cliente' },
    {
      field: 'project.projectTypeId',
      label: 'Proyecto · Tipo de proyecto',
      catalogKey: 'crm.tipo_proyecto',
    },
    { field: 'project.sectorId', label: 'Proyecto · Sector', catalogKey: 'crm.sector_proyecto' },
    {
      field: 'opportunity.stageId',
      label: 'Oportunidad · Etapa',
      catalogKey: 'crm.etapa_oportunidad',
    },
    { field: 'activity.priorityId', label: 'Actividad · Prioridad', catalogKey: 'crm.prioridad' },
    { field: 'activity.typeId', label: 'Actividad · Tipo', catalogKey: 'crm.tipo_actividad' },
  ];

/** `crm.alertas.prioridades`: tipo de alerta → código de `crm.prioridad`. */
export const ALERT_TYPES: readonly { code: string; label: string }[] = [
  { code: 'ACTIVIDAD_VENCIDA', label: 'Actividad vencida' },
  { code: 'VISITA_SIN_CONFIRMAR', label: 'Visita sin confirmar' },
  { code: 'PROYECTO_SIN_ACTUALIZAR', label: 'Proyecto sin actualizar' },
  { code: 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION', label: 'Oportunidad sin siguiente acción' },
];

export const PRIORITY_CATALOG = 'crm.prioridad';
export const STAGE_CATALOG = 'crm.etapa_oportunidad';
export const PHASE_CATALOG = 'crm.fase_cliente';

export const DUPLICATE_ACTION_LABELS: Readonly<Record<string, string>> = {
  NO: 'No comprobar',
  AVISAR: 'Avisar',
  BLOQUEAR: 'Bloquear',
};

export interface DuplicateRuleField {
  key: string;
  label: string;
  actions: readonly string[];
}

const ALL_ACTIONS = ['NO', 'AVISAR', 'BLOQUEAR'] as const;

/** Claves admitidas por parámetro de duplicidad y acciones de cada una (DM-4, 02 RN-02.16). */
export const DUPLICATE_RULE_FIELDS: Readonly<Record<string, readonly DuplicateRuleField[]>> = {
  'crm.clientes.reglas_duplicidad': [
    { key: 'razonSocialNormalizada', label: 'Razón social', actions: ALL_ACTIONS },
    { key: 'nombreComercialNormalizado', label: 'Nombre comercial', actions: ALL_ACTIONS },
    { key: 'correo', label: 'Correo', actions: ALL_ACTIONS },
    { key: 'telefono', label: 'Teléfono', actions: ALL_ACTIONS },
    // El NIT no es único y nunca bloquea (DM-4).
    { key: 'nit', label: 'NIT', actions: ['AVISAR', 'NO'] },
  ],
  'crm.contactos.reglas_duplicidad': [
    // El mismo correo en el mismo cliente siempre bloquea (índice único).
    { key: 'correo', label: 'Correo', actions: ['BLOQUEAR'] },
    { key: 'nombreCompleto', label: 'Nombre completo', actions: ALL_ACTIONS },
    { key: 'telefono', label: 'Teléfono', actions: ALL_ACTIONS },
  ],
};

/** Texto legible de un tipo MIME de `crm.adjuntos.tipos_permitidos`. */
export const MIME_TYPE_LABELS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Imagen JPEG',
  'image/png': 'Imagen PNG',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
};

/** Interpreta un JSON como objeto plano; `null` si no lo es. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Interpreta un JSON como lista de textos; `null` si no lo es. */
export function parseStringArray(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
  } catch {
    return null;
  }
}

export const DASHBOARD_CARDS_DEFAULT_NOTE = 'Es la composición de quienes no personalizaron su panel';

function isEntryList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { key?: unknown }).key === 'string' &&
        typeof (item as { visible?: unknown }).visible === 'boolean',
    )
  );
}

/** Interpreta el valor como composición del panel; `null` si no tiene la forma esperada. */
export function parseDashboardComposition(raw: string): DashboardComposition | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const { blocks, kpis } = value as { blocks?: unknown; kpis?: unknown };
    return isEntryList(blocks) && isEntryList(kpis) ? (value as DashboardComposition) : null;
  } catch {
    return null;
  }
}

/** Entrada del editor del panel: la clave es texto libre porque una versión futura puede traer claves nuevas. */
export interface DashboardEditorEntry {
  key: string;
  visible: boolean;
}

/** Listas cerradas de `editorOptions` ya interpretadas (siempre listas; vacías si faltan). */
export interface DashboardEditorLists {
  blocks: readonly string[];
  kpis: readonly string[];
  lockedVisibleBlocks: readonly string[];
}

/** Lee `editorOptions` de `GET /parameters` con tolerancia: lo que no sea una lista de textos se ignora. */
export function readDashboardEditorLists(
  editorOptions: Readonly<Record<string, readonly string[]>> | null | undefined,
  fallbackLocked: readonly string[],
): DashboardEditorLists {
  const list = (name: string): readonly string[] => {
    const value: unknown = editorOptions?.[name];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  };
  return {
    blocks: list('blocks'),
    kpis: list('kpis'),
    lockedVisibleBlocks: editorOptions?.lockedVisibleBlocks ? list('lockedVisibleBlocks') : fallbackLocked,
  };
}

/**
 * Completa una lista con las claves del servidor que el valor sembrado no trae (p. ej. un bloque
 * nuevo de una versión futura): se añaden al final y visibles, para que el `PATCH` no dé
 * `422 missing_key`. Las claves bloqueadas se fuerzan visibles. No quita ni reordena nada.
 */
export function completeEntries(
  entries: readonly DashboardEditorEntry[],
  serverKeys: readonly string[],
  lockedKeys: readonly string[] = [],
): DashboardEditorEntry[] {
  const present = new Set(entries.map((entry) => entry.key));
  const missing = serverKeys.filter((key) => !present.has(key)).map((key) => ({ key, visible: true }));
  return [...entries, ...missing].map((entry) =>
    lockedKeys.includes(entry.key) && !entry.visible ? { ...entry, visible: true } : entry,
  );
}
