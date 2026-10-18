import { z } from 'zod';

import { canonicalDomain, parseDomainList } from '@/common/identity-claims';

import { LOGIN_SECURITY_PARAMETERS, SSO_ALLOWED_DOMAINS_PARAMETER, SSO_AUTO_PROVISIONING_PARAMETER } from './authentication-settings';
import {
  canonicalDashboardCards,
  DASHBOARD_ALWAYS_VISIBLE_BLOCKS,
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_KPI_KEYS,
  DASHBOARD_PARAMETER_KEY,
  dashboardCardsSchema,
  DEFAULT_DASHBOARD_CARDS,
} from './dashboard-cards';
import type { ParameterValueType } from './ports/parameters.repository.port';

/**
 * Registro de reglas de los parámetros (D-07.7, 07 RN-07.30–RN-07.33, RN-07.46,
 * 00 §8.2). Una regla por clave que lee el código:
 *
 * - `schema` (zod) sobre el valor ya interpretado según `type`: rango, lista de
 *   valores permitidos o esquema JSON. Lo usan `PATCH /parameters/{key}` y
 *   `ParameterReader` (la misma regla al escribir y al leer);
 * - `normalize`: forma canónica que se guarda (p. ej. `crm.campos_obligatorios`
 *   siempre incluye los obligatorios de base);
 * - `references`: códigos de catálogo que el valor usa; el servicio comprueba que
 *   existan y estén activos (necesita la base, por eso no va en el esquema), y el
 *   servicio de catálogos impide desactivarlos (RN-07.26);
 * - `requiresConfigure`: además de `parametros.editar` exige `parametros.configurar`
 *   (RN-07.32; el grupo `seguridad` ya lo exigía, D10);
 * - `readOnly`: no se edita desde la API (`409 SYSTEM_RESOURCE_READ_ONLY`).
 *
 * Los rangos que 00 §8.2 no fija son de **seguridad operativa** (que el valor no
 * desactive un control ni rompa una pantalla), no reglas de negocio; están
 * documentados en cada regla y en la descripción de `PATCH /parameters/{key}`.
 */

export type ParameterEditor =
  | 'number'
  | 'boolean'
  | 'text'
  | 'select'
  | 'timezone'
  | 'required-fields'
  | 'catalog-defaults'
  | 'priority-map'
  | 'stage-transitions'
  | 'progress-rules'
  | 'duplicate-rules'
  | 'mime-types'
  | 'dashboard-cards';

export interface CatalogReference {
  /** Ruta dentro del valor, para `details[].field` (`value.customer.statusId`). */
  field: string;
  catalogKey: string;
  code: string;
}

export interface ParameterRule {
  key: string;
  type: ParameterValueType;
  /** Valor por defecto documentado (forma guardada). El lector lo usa si el guardado es ilegible. */
  defaultValue: string;
  schema: z.ZodTypeAny;
  normalize?: (value: unknown) => unknown;
  references?: (value: unknown) => CatalogReference[];
  requiresConfigure: boolean;
  readOnly: boolean;
  editor: ParameterEditor;
  allowedValues?: readonly string[];
  /**
   * Listas cerradas que el editor necesita y que se definen una sola vez en el backend
   * (`GET /parameters` → `editorOptions`). P. ej. `dashboard-cards`: `blocks`, `kpis` y
   * `lockedVisibleBlocks`.
   */
  editorOptions?: Readonly<Record<string, readonly string[]>>;
  range?: { min: number; max: number };
  /** Catálogos cuyos códigos puede referenciar (para RN-07.26). */
  referencedCatalogs?: readonly string[];
}

// ---------------------------------------------------------------------------
// Constantes de dominio (00 §8.2, 02 RN-02.14/16, 04 RN-04.14, 01 AL-1..AL-4)
// ---------------------------------------------------------------------------

export const DUPLICATE_ACTIONS = ['NO', 'AVISAR', 'BLOQUEAR'] as const;
/** El NIT no es único y nunca bloquea (DM-4). */
export const TAX_ID_DUPLICATE_ACTIONS = ['AVISAR', 'NO'] as const;
export const ALERT_TYPES = [
  'ACTIVIDAD_VENCIDA',
  'VISITA_SIN_CONFIRMAR',
  'PROYECTO_SIN_ACTUALIZAR',
  'OPORTUNIDAD_SIN_SIGUIENTE_ACCION',
] as const;
/** Tipos que el servicio de adjuntos detecta por firma (02 RN-02.29, DM-8). */
export const ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
/** `client_max_body_size` de NGINX (10m): ningún límite de subida puede superarlo. */
export const MAX_UPLOAD_MB = 10;

/**
 * Lista blanca de campos por entidad para `crm.campos_obligatorios` (RN-07.31) y
 * obligatorios de base, que se añaden siempre (no se pueden quitar). Nombres de
 * campo del DTO (00 §2.4, §2.6, §2.10).
 */
export const REQUIRED_FIELDS_WHITELIST: Readonly<Record<string, { base: readonly string[]; allowed: readonly string[] }>> = {
  customer: {
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
  /** Registrar visita realizada (04 D-04.4): existe pero no se siembra. */
  visitCompletion: {
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

/** Entidades que siempre aparecen en el valor guardado (las sembradas). */
const ALWAYS_PRESENT_ENTITIES = ['customer', 'project', 'visit', 'activity'] as const;

/** Campo con valor por defecto → catálogo cuyo código admite (`crm.valores_por_defecto`). */
export const DEFAULT_VALUE_FIELDS: Readonly<Record<string, string>> = {
  'customer.statusId': 'crm.estado_cliente',
  'customer.companyTypeId': 'crm.tipo_empresa',
  'customer.ratingId': 'crm.calificacion_cliente',
  'project.phaseId': 'crm.fase_cliente',
  'project.projectTypeId': 'crm.tipo_proyecto',
  'project.sectorId': 'crm.sector_proyecto',
  'opportunity.stageId': 'crm.etapa_oportunidad',
  'activity.priorityId': 'crm.prioridad',
  'activity.typeId': 'crm.tipo_actividad',
};

// ---------------------------------------------------------------------------
// Piezas de esquema
// ---------------------------------------------------------------------------

const CATALOG_CODE = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/, 'Código de catálogo inválido');
const UNIT_CODE = z.string().regex(/^[A-Z0-9][A-Z0-9_]{0,19}$/, 'Código de unidad inválido');

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function uniqueArray<T extends z.ZodTypeAny>(item: T, min = 0) {
  return z.array(item).min(min, `Debe tener al menos ${min} elemento(s)`).refine((values) => new Set(values).size === values.length, 'Sin valores repetidos');
}

function intRange(min: number, max: number) {
  return z.number().int('Debe ser un número entero').min(min, `Debe estar entre ${min} y ${max}`).max(max, `Debe estar entre ${min} y ${max}`);
}

function numberRule(
  key: string,
  defaultValue: number,
  min: number,
  max: number,
  options: { requiresConfigure?: boolean } = {},
): ParameterRule {
  return {
    key,
    type: 'NUMBER',
    defaultValue: String(defaultValue),
    schema: intRange(min, max),
    requiresConfigure: options.requiresConfigure ?? false,
    readOnly: false,
    editor: 'number',
    range: { min, max },
  };
}

function booleanRule(key: string, defaultValue: boolean, requiresConfigure = false): ParameterRule {
  return {
    key,
    type: 'BOOLEAN',
    defaultValue: String(defaultValue),
    schema: z.boolean(),
    requiresConfigure,
    readOnly: false,
    editor: 'boolean',
  };
}

function enumRule(key: string, values: readonly [string, ...string[]], defaultValue: string): ParameterRule {
  return {
    key,
    type: 'STRING',
    defaultValue,
    schema: z.enum(values as [string, ...string[]]),
    requiresConfigure: false,
    readOnly: false,
    editor: 'select',
    allowedValues: values,
  };
}

function jsonRule(
  key: string,
  defaultValue: unknown,
  schema: z.ZodTypeAny,
  editor: ParameterEditor,
  extra: Partial<ParameterRule> = {},
): ParameterRule {
  return {
    key,
    type: 'JSON',
    defaultValue: JSON.stringify(defaultValue),
    schema,
    requiresConfigure: false,
    readOnly: false,
    editor,
    ...extra,
  };
}

// --- crm.campos_obligatorios -------------------------------------------------

const requiredFieldsSchema = z
  .object(
    Object.fromEntries(
      Object.entries(REQUIRED_FIELDS_WHITELIST).map(([entity, { allowed }]) => [
        entity,
        uniqueArray(z.enum(allowed as [string, ...string[]], { message: `Campo no admitido para ${entity}` })).optional(),
      ]),
    ),
  )
  .strict();

function normalizeRequiredFields(value: unknown): unknown {
  const input = value as Record<string, string[] | undefined>;
  const entities = new Set<string>([...ALWAYS_PRESENT_ENTITIES, ...Object.keys(input)]);
  const output: Record<string, string[]> = {};
  for (const entity of Object.keys(REQUIRED_FIELDS_WHITELIST)) {
    if (!entities.has(entity)) continue;
    const { base } = REQUIRED_FIELDS_WHITELIST[entity]!;
    output[entity] = [...new Set([...base, ...(input[entity] ?? [])])];
  }
  return output;
}

// --- crm.valores_por_defecto -------------------------------------------------

const defaultValuesSchema = z
  .object(Object.fromEntries(Object.keys(DEFAULT_VALUE_FIELDS).map((field) => [field, CATALOG_CODE.optional()])))
  .strict();

function defaultValuesReferences(value: unknown): CatalogReference[] {
  return Object.entries(value as Record<string, string | undefined>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([field, code]) => ({ field: `value.${field}`, catalogKey: DEFAULT_VALUE_FIELDS[field]!, code }));
}

// --- crm.alertas.prioridades -------------------------------------------------

const alertPrioritiesSchema = z
  .object(Object.fromEntries(ALERT_TYPES.map((type) => [type, CATALOG_CODE])))
  .strict();

function alertPrioritiesReferences(value: unknown): CatalogReference[] {
  return Object.entries(value as Record<string, string>).map(([alert, code]) => ({
    field: `value.${alert}`,
    catalogKey: 'crm.prioridad',
    code,
  }));
}

// --- crm.oportunidades.transiciones_etapa ------------------------------------

const stageTransitionsSchema = z
  .record(CATALOG_CODE, uniqueArray(CATALOG_CODE))
  .refine((value) => Object.keys(value).length > 0, 'Debe declarar al menos una etapa');

function stageTransitionsReferences(value: unknown): CatalogReference[] {
  const references: CatalogReference[] = [];
  for (const [from, targets] of Object.entries(value as Record<string, string[]>)) {
    references.push({ field: `value.${from}`, catalogKey: 'crm.etapa_oportunidad', code: from });
    targets.forEach((to, index) =>
      references.push({ field: `value.${from}.${index}`, catalogKey: 'crm.etapa_oportunidad', code: to }),
    );
  }
  return references;
}

// --- crm.proyectos.reglas_avance ---------------------------------------------

const progressRulesSchema = z.record(CATALOG_CODE, z.object({ progresoMinimo: z.number().min(0).max(100) }).strict());

function progressRulesReferences(value: unknown): CatalogReference[] {
  return Object.keys(value as Record<string, unknown>).map((phase) => ({
    field: `value.${phase}`,
    catalogKey: 'crm.fase_cliente',
    code: phase,
  }));
}

// --- Reglas de duplicidad ----------------------------------------------------

const customerDuplicateRulesSchema = z
  .object({
    razonSocialNormalizada: z.enum(DUPLICATE_ACTIONS).optional(),
    nombreComercialNormalizado: z.enum(DUPLICATE_ACTIONS).optional(),
    correo: z.enum(DUPLICATE_ACTIONS).optional(),
    telefono: z.enum(DUPLICATE_ACTIONS).optional(),
    nit: z.enum(TAX_ID_DUPLICATE_ACTIONS, { message: 'nit solo admite AVISAR o NO (DM-4)' }).optional(),
  })
  .strict();

const contactDuplicateRulesSchema = z
  .object({
    // El mismo correo en el mismo cliente siempre bloquea (índice único, 02 RN-02.16).
    correo: z.literal('BLOQUEAR', { errorMap: () => ({ message: 'correo siempre bloquea (BLOQUEAR)' }) }).optional(),
    nombreCompleto: z.enum(DUPLICATE_ACTIONS).optional(),
    telefono: z.enum(DUPLICATE_ACTIONS).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

const RULES: readonly ParameterRule[] = [
  // Existentes (PLAN-ADMIN D10). Rangos iguales a PARAMETER_RANGES de parameter-value.ts.
  numberRule(LOGIN_SECURITY_PARAMETERS.maxFailedAttempts, 5, 1, 20, { requiresConfigure: true }),
  numberRule(LOGIN_SECURITY_PARAMETERS.lockoutMinutes, 15, 1, 1440, { requiresConfigure: true }),
  numberRule(LOGIN_SECURITY_PARAMETERS.passwordExpiryDays, 0, 0, 365, { requiresConfigure: true }),
  // ADR-027: alta automática (sin permisos) al primer ingreso con Entra ID. Del grupo `seguridad`: exige `parametros.configurar`.
  booleanRule(SSO_AUTO_PROVISIONING_PARAMETER, true, true),
  // ADR-027: dominios de correo que pueden darse de alta solos (exacto, sin distinguir mayúsculas). Solo frena altas nuevas.
  {
    key: SSO_ALLOWED_DOMAINS_PARAMETER,
    type: 'STRING',
    defaultValue: 'somosgrupoag.com',
    schema: z
      .string()
      .max(1000)
      .superRefine((value, ctx) => {
        const parts = value.split(',').filter((part) => part.trim().length > 0);
        if (parts.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Indica al menos un dominio (para frenar las altas, apaga seguridad.sso_alta_automatica)' });
        }
        if (parts.some((part) => canonicalDomain(part) === null)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada dominio debe ser como somosgrupoag.com (letras, dígitos y guiones, con punto), separados por comas' });
        }
      }),
    normalize: (value) => parseDomainList(value as string).join(','),
    requiresConfigure: true,
    readOnly: false,
    editor: 'text',
  },
  // Acorta la ventana de la bitácora: estructural (M-2 de seguridad, decisión de 2026-10-14).
  numberRule('auditoria.dias_retencion', 365, 30, 3650, { requiresConfigure: true }),
  numberRule('ui.paginacion_default', 20, 1, 100),

  // CRM (00 §8.2)
  {
    key: 'crm.zona_horaria_negocio',
    type: 'STRING',
    defaultValue: 'America/Guatemala',
    schema: z.string().min(1).max(64).refine(isTimeZone, 'Debe ser una zona horaria IANA válida'),
    requiresConfigure: true,
    readOnly: false,
    editor: 'timezone',
  },
  {
    key: 'crm.moneda_base',
    type: 'STRING',
    defaultValue: 'USD',
    schema: z.literal('USD'),
    requiresConfigure: true,
    readOnly: true,
    editor: 'text',
    allowedValues: ['USD'],
  },
  numberRule('crm.tipos_cambio.dias_aviso_antiguedad', 31, 1, 366),
  // Umbrales de alertas: hasta 30 días en horas y un año en días.
  numberRule('crm.alertas.actividad_por_vencer_horas', 48, 1, 720),
  numberRule('crm.alertas.visita_sin_confirmar_horas', 48, 1, 720),
  numberRule('crm.alertas.proyecto_sin_actualizar_dias', 30, 1, 365),
  booleanRule('crm.alertas.oportunidad_sin_siguiente_accion', true),
  jsonRule(
    'crm.alertas.prioridades',
    {
      ACTIVIDAD_VENCIDA: 'ALTA',
      VISITA_SIN_CONFIRMAR: 'MEDIA',
      PROYECTO_SIN_ACTUALIZAR: 'MEDIA',
      OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'ALTA',
    },
    alertPrioritiesSchema,
    'priority-map',
    { references: alertPrioritiesReferences, referencedCatalogs: ['crm.prioridad'] },
  ),
  enumRule('crm.visitas.validar_conflicto_horario', ['NO', 'AVISAR', 'BLOQUEAR'], 'AVISAR'),
  numberRule('crm.visitas.duracion_por_defecto_minutos', 60, 5, 1440),
  jsonRule(
    'crm.oportunidades.transiciones_etapa',
    {
      CONTACTADO: ['COTIZANDO', 'GANADO', 'PERDIDO'],
      COTIZANDO: ['CONTACTADO', 'GANADO', 'PERDIDO'],
      GANADO: [],
      PERDIDO: [],
    },
    stageTransitionsSchema,
    'stage-transitions',
    { references: stageTransitionsReferences, referencedCatalogs: ['crm.etapa_oportunidad'] },
  ),
  jsonRule('crm.proyectos.reglas_avance', { FINALIZADO: { progresoMinimo: 100 } }, progressRulesSchema, 'progress-rules', {
    references: progressRulesReferences,
    referencedCatalogs: ['crm.fase_cliente'],
  }),
  enumRule('crm.clientes.unicidad_codigo', ['PAIS', 'GLOBAL'], 'PAIS'),
  jsonRule(
    'crm.clientes.reglas_duplicidad',
    { razonSocialNormalizada: 'AVISAR', nit: 'AVISAR' },
    customerDuplicateRulesSchema,
    'duplicate-rules',
  ),
  jsonRule(
    'crm.contactos.reglas_duplicidad',
    { correo: 'BLOQUEAR', nombreCompleto: 'AVISAR' },
    contactDuplicateRulesSchema,
    'duplicate-rules',
  ),
  jsonRule(
    'crm.campos_obligatorios',
    normalizeRequiredFields({}),
    requiredFieldsSchema,
    'required-fields',
    { normalize: normalizeRequiredFields },
  ),
  jsonRule(
    'crm.valores_por_defecto',
    {
      'customer.statusId': 'PROSPECTO',
      'project.phaseId': 'DISENO',
      'opportunity.stageId': 'CONTACTADO',
      'activity.priorityId': 'MEDIA',
    },
    defaultValuesSchema,
    'catalog-defaults',
    { references: defaultValuesReferences, referencedCatalogs: [...new Set(Object.values(DEFAULT_VALUE_FIELDS))] },
  ),
  numberRule('crm.forecast.horizonte_meses', 6, 1, 24, { requiresConfigure: true }),
  {
    key: 'crm.forecast.unidad_tonelaje',
    type: 'STRING',
    defaultValue: 'TON',
    schema: UNIT_CODE,
    requiresConfigure: true,
    readOnly: false,
    editor: 'text',
  },
  booleanRule('crm.importaciones.habilitada', false, true),
  numberRule('crm.importaciones.max_filas', 5000, 1, 50_000),
  numberRule('crm.importaciones.max_mb', 10, 1, MAX_UPLOAD_MB),
  numberRule('crm.importaciones.dias_retencion_filas', 90, 1, 3650),
  numberRule('crm.adjuntos.max_mb', 10, 1, MAX_UPLOAD_MB),
  jsonRule(
    'crm.adjuntos.tipos_permitidos',
    [...ATTACHMENT_MIME_TYPES],
    uniqueArray(z.enum(ATTACHMENT_MIME_TYPES, { message: 'Tipo de archivo no admitido' }), 1),
    'mime-types',
    { allowedValues: ATTACHMENT_MIME_TYPES },
  ),
  numberRule('crm.inicio.visitas_proximas_dias', 7, 1, 60),
  // Ajustes 1 (AJ1-1, AJ1-6): interfaz. Ninguno exige `parametros.configurar` (ni estructurales ni de seguridad).
  // Composición por defecto de Inicio (RN-AJ1.1, D-AJ1.11): el mismo esquema vale para la preferencia del usuario.
  jsonRule(DASHBOARD_PARAMETER_KEY, DEFAULT_DASHBOARD_CARDS, dashboardCardsSchema, 'dashboard-cards', {
    normalize: canonicalDashboardCards,
    allowedValues: [...DASHBOARD_BLOCK_KEYS, ...DASHBOARD_KPI_KEYS],
    editorOptions: {
      blocks: DASHBOARD_BLOCK_KEYS,
      kpis: DASHBOARD_KPI_KEYS,
      lockedVisibleBlocks: DASHBOARD_ALWAYS_VISIBLE_BLOCKS,
    },
  }),
  // Buscar y notificaciones aún no tienen función (D-AJ1.4): sembrados en `false`.
  booleanRule('ui.barra_superior.buscar', false),
  booleanRule('ui.barra_superior.pantalla_completa', true),
  booleanRule('ui.barra_superior.notificaciones', false),
  // XLSX admite 1 048 576 filas por hoja.
  numberRule('crm.reportes.max_filas_exportacion', 100_000, 1, 1_000_000),
  booleanRule('sistema.permite_datos_demo', false, true),
];

export const PARAMETER_RULES: ReadonlyMap<string, ParameterRule> = new Map(RULES.map((rule) => [rule.key, rule]));

/** Claves eliminadas por decisión (DM-4, DM-36): no deben existir en la base. */
export const REMOVED_PARAMETER_KEYS = ['crm.clientes.unicidad_nit', 'crm.moneda_por_defecto'] as const;

export function ruleFor(key: string): ParameterRule | undefined {
  return PARAMETER_RULES.get(key);
}

/** Interpreta el texto guardado según el tipo de la regla. Lanza si no es interpretable. */
export function parseRawValue(type: ParameterValueType, raw: string): unknown {
  const value = raw.trim();
  switch (type) {
    case 'NUMBER': {
      if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error('not a number');
      return Number(value);
    }
    case 'BOOLEAN':
      if (value !== 'true' && value !== 'false') throw new Error('not a boolean');
      return value === 'true';
    case 'JSON':
      return JSON.parse(value) as unknown;
    default:
      return value;
  }
}

export function serializeValue(type: ParameterValueType, value: unknown): string {
  return type === 'JSON' ? JSON.stringify(value) : String(value);
}

export interface RuleIssue {
  field: string;
  issue: string;
}

export type RuleResult = { ok: true; value: unknown; stored: string } | { ok: false; issues: RuleIssue[] };

/**
 * Valida el texto `raw` con la regla: interpreta, aplica el esquema y normaliza.
 * Sin efectos ni acceso a datos (las referencias a catálogos las comprueba el servicio).
 */
export function applyRule(rule: ParameterRule, raw: string): RuleResult {
  let parsed: unknown;
  try {
    parsed = parseRawValue(rule.type, raw);
  } catch {
    return { ok: false, issues: [{ field: 'value', issue: `No es un valor ${rule.type} válido` }] };
  }
  const result = rule.schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        field: ['value', ...issue.path.map(String), ...(issue.code === 'unrecognized_keys' ? issue.keys : [])].join('.'),
        issue: issue.code === 'unrecognized_keys' ? 'Clave no admitida' : issue.message,
      })),
    };
  }
  const value = rule.normalize ? rule.normalize(result.data) : result.data;
  return { ok: true, value, stored: serializeValue(rule.type, value) };
}

/** Referencias a catálogos que contiene un valor ya validado. */
export function catalogReferencesOf(rule: ParameterRule, value: unknown): CatalogReference[] {
  return rule.references ? rule.references(value) : [];
}

/** Reglas cuyo valor puede referenciar códigos del catálogo `catalogKey` (RN-07.26). */
export function rulesReferencingCatalog(catalogKey: string): ParameterRule[] {
  return RULES.filter((rule) => rule.referencedCatalogs?.includes(catalogKey));
}
