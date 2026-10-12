import { z } from 'zod';

import type { CatalogItemMetadata } from './ports/catalogs.repository.port';

/**
 * Registro de semántica de los catálogos del CRM (00 §3.2–§3.4, 07 RN-07.23–RN-07.28,
 * D-07.6). Por cada `Catalog.key` `crm.*` declara:
 *
 * - el **esquema de `metadata`** (claves, tipos, obligatoriedad). Es estricto: una
 *   clave no declarada también es `422 INVALID_CATALOG_METADATA`;
 * - las **reglas por elemento** (p. ej. "exactamente un indicador verdadero") y los
 *   **invariantes del catálogo** sobre los elementos activos (p. ej. "al menos una
 *   etapa abierta"). Romperlos es `409 CATALOG_INVARIANT`;
 * - si es un **conjunto cerrado** (`crm.resultado_oportunidad`): no se crean ni se
 *   desactivan elementos, ni cambia su `metadata`; solo etiqueta y orden.
 *
 * La lógica de los módulos pregunta por estos indicadores, nunca por etiquetas
 * ni UUID (00 §3.3). Los catálogos que no están aquí conservan el
 * comportamiento genérico (RN-07.28).
 */

export type MetadataFieldType = 'boolean' | 'number' | 'string' | 'enum' | 'enum[]' | 'string[]';

/** Descripción de una clave de `metadata`, para pintar un formulario (07 F.4). */
export interface MetadataFieldSpec {
  key: string;
  type: MetadataFieldType;
  required: boolean;
  nullable?: boolean;
  values?: readonly string[];
  min?: number;
  max?: number;
  integer?: boolean;
}

/** Elemento tal como lo evalúan las reglas: solo lo que tiene semántica. */
export interface SemanticItem {
  code: string;
  isActive: boolean;
  metadata: CatalogItemMetadata | null;
}

export interface CatalogSemantics {
  key: string;
  fields: readonly MetadataFieldSpec[];
  closedSet: boolean;
  /** Códigos del conjunto cerrado (valores del enum que respaldan el catálogo). */
  closedCodes?: readonly string[];
  /** Reglas de un elemento (sobre `metadata` ya validado). Devuelve los incumplimientos. */
  itemRules?: (metadata: CatalogItemMetadata) => string[];
  /** Invariantes del catálogo sobre los elementos ACTIVOS. Devuelve los incumplimientos. */
  invariants?: (activeItems: readonly SemanticItem[]) => string[];
}

const OUTCOMES = ['WON', 'LOST'] as const;
const RESULT_OUTCOMES = ['WON', 'LOST', 'PARTIAL'] as const;
/** Nombre de campo de formulario (`durationMinutes`, `nextAction`…). */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,59}$/;

function bool(key: string, required = true): MetadataFieldSpec {
  return { key, type: 'boolean', required };
}

function intField(key: string, extra: Partial<MetadataFieldSpec> = {}): MetadataFieldSpec {
  return { key, type: 'number', required: true, integer: true, ...extra };
}

function flag(metadata: CatalogItemMetadata | null, key: string): boolean {
  return metadata?.[key] === true;
}

function countTrue(metadata: CatalogItemMetadata, keys: readonly string[]): number {
  return keys.filter((key) => metadata[key] === true).length;
}

/** "Exactamente un indicador verdadero por elemento". */
function exactlyOneOf(keys: readonly string[]) {
  return (metadata: CatalogItemMetadata): string[] =>
    countTrue(metadata, keys) === 1 ? [] : [`Exactamente uno de ${keys.join(', ')} debe ser true`];
}

/** "Al menos un elemento activo por indicador". */
function atLeastOneActivePer(keys: readonly string[]) {
  return (items: readonly SemanticItem[]): string[] =>
    keys
      .filter((key) => !items.some((item) => flag(item.metadata, key)))
      .map((key) => `Debe quedar al menos un elemento activo con ${key}=true`);
}

const VISIT_STATE_FLAGS = ['isPending', 'isDone', 'isConfirmed', 'isCancelled'] as const;
const ACTIVITY_STATE_FLAGS = ['isOpen', 'isCompleted', 'isCancelled'] as const;

const DEFINITIONS: readonly CatalogSemantics[] = [
  { key: 'crm.tipo_empresa', fields: [], closedSet: false },
  { key: 'crm.estado_cliente', fields: [bool('isActive')], closedSet: false },
  { key: 'crm.calificacion_cliente', fields: [intField('rank', { min: 0, max: 1000 })], closedSet: false },
  { key: 'crm.tipo_proyecto', fields: [], closedSet: false },
  { key: 'crm.sector_proyecto', fields: [], closedSet: false },
  {
    key: 'crm.fase_cliente',
    fields: [
      intField('order', { min: 0, max: 1000 }),
      bool('isFinal'),
      { key: 'defaultProgress', type: 'number', required: false, min: 0, max: 100 },
    ],
    closedSet: false,
    invariants: (items) => {
      const issues: string[] = [];
      if (!items.some((item) => item.metadata?.['isFinal'] === false)) {
        issues.push('Debe quedar al menos una fase activa no final (isFinal=false)');
      }
      if (!items.some((item) => flag(item.metadata, 'isFinal'))) {
        issues.push('Debe quedar al menos una fase activa final (isFinal=true)');
      }
      return issues;
    },
  },
  {
    key: 'crm.etapa_oportunidad',
    fields: [
      intField('order', { min: 0, max: 1000 }),
      bool('isClosed'),
      { key: 'outcome', type: 'enum', required: false, nullable: true, values: OUTCOMES },
      bool('inFunnel'),
    ],
    closedSet: false,
    itemRules: (metadata) =>
      metadata['isClosed'] !== true && metadata['outcome'] !== undefined && metadata['outcome'] !== null
        ? ['outcome solo se admite en etapas cerradas (isClosed=true)']
        : [],
    invariants: (items) => {
      const issues: string[] = [];
      if (!items.some((item) => item.metadata?.['isClosed'] === false)) {
        issues.push('Debe quedar al menos una etapa activa abierta (isClosed=false)');
      }
      for (const outcome of OUTCOMES) {
        if (!items.some((item) => item.metadata?.['outcome'] === outcome)) {
          issues.push(`Debe quedar al menos una etapa activa con outcome="${outcome}"`);
        }
      }
      return issues;
    },
  },
  {
    key: 'crm.resultado_oportunidad',
    fields: [
      bool('requiresReason'),
      bool('requiresAwardedPercent'),
      { key: 'stageOutcome', type: 'enum', required: true, values: OUTCOMES },
    ],
    closedSet: true,
    closedCodes: RESULT_OUTCOMES,
  },
  {
    key: 'crm.motivo_resultado',
    fields: [{ key: 'appliesTo', type: 'enum[]', required: true, values: RESULT_OUTCOMES }],
    closedSet: false,
  },
  { key: 'crm.estado_producto_asociado', fields: [bool('isActive')], closedSet: false },
  {
    key: 'crm.tipo_actividad',
    fields: [bool('isInteraction'), { key: 'fields', type: 'string[]', required: true }],
    closedSet: false,
  },
  {
    key: 'crm.estado_actividad',
    fields: ACTIVITY_STATE_FLAGS.map((key) => bool(key)),
    closedSet: false,
    itemRules: exactlyOneOf(ACTIVITY_STATE_FLAGS),
    invariants: atLeastOneActivePer(ACTIVITY_STATE_FLAGS),
  },
  {
    key: 'crm.estado_visita',
    // `isRescheduled` (04 D-04.3) marca el estado REPROGRAMADA, que también es pendiente
    // (04 RN-04.19: "isPending = PROGRAMADA o REPROGRAMADA"). Es un modificador, no
    // cuenta en "exactamente uno". Puede faltar o estar inactivo: la visita
    // reprogramada queda entonces en el estado pendiente inicial.
    fields: [...VISIT_STATE_FLAGS.map((key) => bool(key)), bool('isRescheduled', false)],
    closedSet: false,
    itemRules: (metadata) => {
      const issues = exactlyOneOf(VISIT_STATE_FLAGS)(metadata);
      if (metadata['isRescheduled'] === true && metadata['isPending'] !== true) {
        issues.push('isRescheduled=true exige isPending=true');
      }
      return issues;
    },
    invariants: (items) => {
      const issues = atLeastOneActivePer(VISIT_STATE_FLAGS)(items);
      if (items.filter((item) => flag(item.metadata, 'isRescheduled')).length > 1) {
        issues.push('Solo puede haber un elemento activo con isRescheduled=true');
      }
      return issues;
    },
  },
  { key: 'crm.prioridad', fields: [intField('weight', { min: 0, max: 1000 })], closedSet: false },
  { key: 'crm.motivo_reprogramacion', fields: [], closedSet: false },
  { key: 'crm.motivo_cancelacion', fields: [], closedSet: false },
  { key: 'crm.resultado_interaccion', fields: [], closedSet: false },
];

export const CATALOG_SEMANTICS: ReadonlyMap<string, CatalogSemantics> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function semanticsFor(catalogKey: string): CatalogSemantics | undefined {
  return CATALOG_SEMANTICS.get(catalogKey);
}

function zodFor(field: MetadataFieldSpec): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (field.type) {
    case 'boolean':
      schema = z.boolean();
      break;
    case 'number': {
      let number = z.number().finite();
      if (field.integer) number = number.int();
      if (field.min !== undefined) number = number.min(field.min);
      if (field.max !== undefined) number = number.max(field.max);
      schema = number;
      break;
    }
    case 'enum':
      schema = z.enum(field.values as [string, ...string[]]);
      break;
    case 'enum[]':
      schema = z
        .array(z.enum(field.values as [string, ...string[]]))
        .min(1)
        .refine((values) => new Set(values).size === values.length, 'Sin valores repetidos');
      break;
    case 'string[]':
      schema = z
        .array(z.string().regex(FIELD_NAME, 'Nombre de campo inválido'))
        .max(50)
        .refine((values) => new Set(values).size === values.length, 'Sin valores repetidos');
      break;
    case 'string':
    default:
      schema = z.string().min(1).max(200);
  }
  if (field.nullable) schema = schema.nullable();
  if (!field.required) schema = schema.optional();
  return schema;
}

const schemaCache = new Map<string, z.ZodTypeAny>();

function metadataSchema(semantics: CatalogSemantics): z.ZodTypeAny {
  let schema = schemaCache.get(semantics.key);
  if (!schema) {
    schema = z.object(Object.fromEntries(semantics.fields.map((field) => [field.key, zodFor(field)]))).strict();
    schemaCache.set(semantics.key, schema);
  }
  return schema;
}

export interface MetadataIssue {
  field: string;
  issue: string;
}

/**
 * Valida `metadata` contra el esquema del catálogo. `null` equivale a `{}`: en un
 * catálogo con claves obligatorias falla. Devuelve los problemas (vacío = válido).
 */
export function validateMetadata(semantics: CatalogSemantics, metadata: CatalogItemMetadata | null): MetadataIssue[] {
  const result = metadataSchema(semantics).safeParse(metadata ?? {});
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => ({
    field: ['metadata', ...issue.path.map(String), ...(issue.code === 'unrecognized_keys' ? issue.keys : [])].join('.'),
    issue: issue.code === 'unrecognized_keys' ? 'Clave no admitida en este catálogo' : issue.message,
  }));
}

/** Reglas del elemento (409 si se incumplen). Presupone `metadata` válido. */
export function itemRuleViolations(semantics: CatalogSemantics, metadata: CatalogItemMetadata | null): string[] {
  return semantics.itemRules ? semantics.itemRules(metadata ?? {}) : [];
}

/** Invariantes del catálogo sobre los elementos activos. */
export function invariantViolations(semantics: CatalogSemantics, items: readonly SemanticItem[]): string[] {
  return semantics.invariants ? semantics.invariants(items.filter((item) => item.isActive)) : [];
}
