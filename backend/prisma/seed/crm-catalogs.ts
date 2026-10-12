/**
 * Los 17 catálogos genéricos del CRM (00 §3.2), con sus códigos inmutables y la
 * semántica en `metadata` que lee el código (00 §3.3). La lógica nunca compara
 * etiquetas ni UUID: pregunta por `isClosed`, `isFinal`, `isOpen`…
 *
 * Todos son `isSystem = true`. La semilla crea los elementos que falten y no
 * toca los existentes (etiqueta, orden, `metadata` y `isActive` son editables
 * desde Administración → Catálogos; un elemento desactivado no se reactiva).
 */

export type CatalogMetadata = Record<string, string | number | boolean | null | string[]>;

export interface CatalogItemSeed {
  code: string;
  label: string;
  metadata?: CatalogMetadata;
}

export interface CatalogSeed {
  key: string;
  name: string;
  description: string;
  items: CatalogItemSeed[];
}

/** Campos específicos por tipo de actividad (D-04.8, valor aprobado). */
const CALL_MEETING_FIELDS = ['scheduledAt', 'durationMinutes', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'];
const EMAIL_FIELDS = ['scheduledAt', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'];
const TASK_FIELDS = ['scheduledAt', 'resultId', 'resultNotes'];

const ALL_OUTCOMES = ['WON', 'LOST', 'PARTIAL'];

/** Exactamente un indicador `true` por elemento (invariante de 00 §3.3). */
function flags<K extends string>(all: readonly K[], on: K, extra: CatalogMetadata = {}): CatalogMetadata {
  return { ...Object.fromEntries(all.map((key) => [key, key === on])), ...extra };
}

const ACTIVITY_STATE_FLAGS = ['isOpen', 'isCompleted', 'isCancelled'] as const;
const VISIT_STATE_FLAGS = ['isPending', 'isDone', 'isConfirmed', 'isCancelled'] as const;

export const CRM_CATALOGS: CatalogSeed[] = [
  {
    key: 'crm.tipo_empresa',
    name: 'Tipos de empresa',
    description: 'Tipo de empresa del cliente.',
    items: [
      { code: 'CONSTRUCTORA', label: 'Constructora' },
      { code: 'DESARROLLADORA', label: 'Desarrolladora' },
      { code: 'DISTRIBUIDOR', label: 'Distribuidor' },
      { code: 'FERRETERIA', label: 'Ferretería' },
      { code: 'INDUSTRIA', label: 'Industria' },
      { code: 'GOBIERNO', label: 'Gobierno' },
      { code: 'OTRO', label: 'Otro' },
    ],
  },
  {
    key: 'crm.estado_cliente',
    name: 'Estados de cliente',
    description: 'Estado comercial del cliente. metadata.isActive indica si el cliente cuenta como activo.',
    items: [
      { code: 'PROSPECTO', label: 'Prospecto', metadata: { isActive: true } },
      { code: 'ACTIVO', label: 'Activo', metadata: { isActive: true } },
      { code: 'INACTIVO', label: 'Inactivo', metadata: { isActive: false } },
    ],
  },
  {
    key: 'crm.calificacion_cliente',
    name: 'Calificaciones de cliente',
    description: 'Calificación del cliente. metadata.rank ordena la presentación.',
    items: [
      { code: 'A', label: 'A', metadata: { rank: 1 } },
      { code: 'B', label: 'B', metadata: { rank: 2 } },
      { code: 'C', label: 'C', metadata: { rank: 3 } },
    ],
  },
  {
    key: 'crm.tipo_proyecto',
    name: 'Tipos de proyecto',
    description: 'Tipo de proyecto. También es ámbito de reglas de conversión.',
    items: [
      { code: 'VIVIENDA', label: 'Vivienda' },
      { code: 'EDIFICIO', label: 'Edificio' },
      { code: 'INFRAESTRUCTURA', label: 'Infraestructura' },
      { code: 'INDUSTRIAL', label: 'Industrial' },
      { code: 'COMERCIAL', label: 'Comercial' },
    ],
  },
  {
    key: 'crm.sector_proyecto',
    name: 'Sectores de proyecto',
    description: 'Sector o uso del proyecto.',
    items: [
      { code: 'RESIDENCIAL', label: 'Residencial' },
      { code: 'COMERCIAL', label: 'Comercial' },
      { code: 'INDUSTRIAL', label: 'Industrial' },
      { code: 'PUBLICO', label: 'Público' },
      { code: 'MIXTO', label: 'Mixto' },
    ],
  },
  {
    key: 'crm.fase_cliente',
    name: 'Fases del cliente',
    description: 'Fase del proyecto del cliente. metadata: order, isFinal, defaultProgress (opcional).',
    items: [
      { code: 'DISENO', label: 'Diseño', metadata: { order: 1, isFinal: false } },
      { code: 'COTIZACION', label: 'Cotización', metadata: { order: 2, isFinal: false } },
      { code: 'CONSTRUCCION', label: 'Construcción', metadata: { order: 3, isFinal: false } },
      { code: 'FINALIZADO', label: 'Finalizado', metadata: { order: 4, isFinal: true, defaultProgress: 100 } },
    ],
  },
  {
    key: 'crm.etapa_oportunidad',
    name: 'Etapas de oportunidad',
    description: 'Etapa del pipeline. metadata: order, isClosed, outcome (WON/LOST/null), inFunnel.',
    items: [
      { code: 'CONTACTADO', label: 'Contactado', metadata: { order: 1, isClosed: false, outcome: null, inFunnel: true } },
      { code: 'COTIZANDO', label: 'Cotizando', metadata: { order: 2, isClosed: false, outcome: null, inFunnel: true } },
      { code: 'GANADO', label: 'Ganado', metadata: { order: 3, isClosed: true, outcome: 'WON', inFunnel: true } },
      { code: 'PERDIDO', label: 'Perdido', metadata: { order: 4, isClosed: true, outcome: 'LOST', inFunnel: false } },
    ],
  },
  {
    key: 'crm.resultado_oportunidad',
    name: 'Resultados de oportunidad',
    description: 'Conjunto cerrado (enum OpportunityOutcome): solo cambian etiqueta y orden.',
    items: [
      { code: 'WON', label: 'Ganado', metadata: { requiresReason: false, requiresAwardedPercent: false, stageOutcome: 'WON' } },
      { code: 'LOST', label: 'Perdido', metadata: { requiresReason: true, requiresAwardedPercent: false, stageOutcome: 'LOST' } },
      { code: 'PARTIAL', label: 'Parcial', metadata: { requiresReason: false, requiresAwardedPercent: true, stageOutcome: 'WON' } },
    ],
  },
  {
    key: 'crm.motivo_resultado',
    name: 'Motivos de resultado',
    description: 'Motivo del resultado comercial. metadata.appliesTo: resultados a los que aplica.',
    items: [
      { code: 'PRECIO', label: 'Precio', metadata: { appliesTo: ALL_OUTCOMES } },
      { code: 'PLAZO_ENTREGA', label: 'Plazo de entrega', metadata: { appliesTo: ALL_OUTCOMES } },
      { code: 'COMPETENCIA', label: 'Competencia', metadata: { appliesTo: ['LOST', 'PARTIAL'] } },
      { code: 'ESPECIFICACION_TECNICA', label: 'Especificación técnica', metadata: { appliesTo: ALL_OUTCOMES } },
      { code: 'CREDITO', label: 'Crédito', metadata: { appliesTo: ['LOST', 'PARTIAL'] } },
      { code: 'PROYECTO_CANCELADO', label: 'Proyecto cancelado', metadata: { appliesTo: ['LOST'] } },
      { code: 'OTRO', label: 'Otro', metadata: { appliesTo: ALL_OUTCOMES } },
    ],
  },
  {
    key: 'crm.estado_producto_asociado',
    name: 'Estados de producto asociado',
    description: 'Estado de un producto en el proyecto. metadata.isActive: si suma en totales.',
    items: [
      { code: 'PROPUESTO', label: 'Propuesto', metadata: { isActive: true } },
      { code: 'COTIZADO', label: 'Cotizado', metadata: { isActive: true } },
      { code: 'ADJUDICADO', label: 'Adjudicado', metadata: { isActive: true } },
      { code: 'DESCARTADO', label: 'Descartado', metadata: { isActive: false } },
    ],
  },
  {
    key: 'crm.tipo_actividad',
    name: 'Tipos de actividad',
    description: 'Tipo de actividad. metadata: isInteraction, fields (campos específicos del formulario, D-04.8).',
    items: [
      { code: 'LLAMADA', label: 'Llamada', metadata: { isInteraction: true, fields: CALL_MEETING_FIELDS } },
      { code: 'REUNION', label: 'Reunión', metadata: { isInteraction: true, fields: CALL_MEETING_FIELDS } },
      { code: 'CORREO', label: 'Correo', metadata: { isInteraction: true, fields: EMAIL_FIELDS } },
      { code: 'TAREA', label: 'Tarea', metadata: { isInteraction: false, fields: TASK_FIELDS } },
    ],
  },
  {
    key: 'crm.estado_actividad',
    name: 'Estados de actividad',
    description: 'Estado de la actividad. Exactamente uno de isOpen, isCompleted, isCancelled. "Vencida" no es un estado.',
    items: [
      { code: 'PENDIENTE', label: 'Pendiente', metadata: flags(ACTIVITY_STATE_FLAGS, 'isOpen') },
      { code: 'EN_PROCESO', label: 'En proceso', metadata: flags(ACTIVITY_STATE_FLAGS, 'isOpen') },
      { code: 'COMPLETADA', label: 'Completada', metadata: flags(ACTIVITY_STATE_FLAGS, 'isCompleted') },
      { code: 'CANCELADA', label: 'Cancelada', metadata: flags(ACTIVITY_STATE_FLAGS, 'isCancelled') },
    ],
  },
  {
    key: 'crm.estado_visita',
    name: 'Estados de visita',
    description:
      'Estado de la visita (DM-20). Exactamente uno de isPending, isDone, isConfirmed, isCancelled; isRescheduled identifica la reprogramada (D-04.3).',
    items: [
      { code: 'PROGRAMADA', label: 'Programada', metadata: flags(VISIT_STATE_FLAGS, 'isPending', { isRescheduled: false }) },
      { code: 'REPROGRAMADA', label: 'Reprogramada', metadata: flags(VISIT_STATE_FLAGS, 'isPending', { isRescheduled: true }) },
      { code: 'REALIZADA', label: 'Realizada', metadata: flags(VISIT_STATE_FLAGS, 'isDone', { isRescheduled: false }) },
      { code: 'CONFIRMADA', label: 'Confirmada', metadata: flags(VISIT_STATE_FLAGS, 'isConfirmed', { isRescheduled: false }) },
      { code: 'CANCELADA', label: 'Cancelada', metadata: flags(VISIT_STATE_FLAGS, 'isCancelled', { isRescheduled: false }) },
    ],
  },
  {
    key: 'crm.prioridad',
    name: 'Prioridades',
    description: 'Prioridad de actividades y alertas. metadata.weight: mayor peso, más arriba en las bandejas.',
    items: [
      { code: 'ALTA', label: 'Alta', metadata: { weight: 3 } },
      { code: 'MEDIA', label: 'Media', metadata: { weight: 2 } },
      { code: 'BAJA', label: 'Baja', metadata: { weight: 1 } },
    ],
  },
  {
    key: 'crm.motivo_reprogramacion',
    name: 'Motivos de reprogramación',
    description: 'Motivo al reprogramar una visita.',
    items: [
      { code: 'SOLICITUD_CLIENTE', label: 'Solicitud del cliente' },
      { code: 'AGENDA_ASESOR', label: 'Agenda del asesor' },
      { code: 'CLIMA', label: 'Clima' },
      { code: 'OTRO', label: 'Otro' },
    ],
  },
  {
    key: 'crm.motivo_cancelacion',
    name: 'Motivos de cancelación',
    description: 'Motivo al cancelar una visita.',
    items: [
      { code: 'CANCELA_CLIENTE', label: 'Cancela el cliente' },
      { code: 'PROYECTO_SUSPENDIDO', label: 'Proyecto suspendido' },
      { code: 'DUPLICADA', label: 'Duplicada' },
      { code: 'OTRO', label: 'Otro' },
    ],
  },
  {
    key: 'crm.resultado_interaccion',
    name: 'Resultados de interacción',
    description: 'Resultado de una visita o actividad (DM-21).',
    items: [
      { code: 'POSITIVO', label: 'Positivo' },
      { code: 'NEUTRAL', label: 'Neutral' },
      { code: 'NEGATIVO', label: 'Negativo' },
      { code: 'SIN_CONTACTO', label: 'Sin contacto' },
    ],
  },
];
