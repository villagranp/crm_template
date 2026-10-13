import { z } from 'zod';

import { compareDecimals, DECIMAL_SPECS, describeDecimalIssue, parseDecimal, type DecimalSpec } from '@/features/crm/common/decimal';

import { isCalendarDate } from './project-format';
import type { OwnerOption, PhaseOption, TonnageMode } from './projects.api';

/**
 * Validación de los formularios del submódulo de Proyectos (03 §E.3–§E.5,
 * §C.1, §C.5, §C.6). Es experiencia de usuario: el backend valida de nuevo y es
 * quien decide. Los obligatorios llegan de `form-options.requiredFields`, los
 * límites son los de los DTO y los decimales se validan con `decimal.ts`
 * (cadenas, nunca `number`).
 */

export const PROJECT_LIMITS = {
  name: 200,
  city: 120,
  address: 300,
  description: 10000,
  code: 30,
  comment: 1000,
  notes: 1000,
} as const;

export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
export const DATE_MESSAGE = 'Escribe una fecha válida.';
export const DATE_RANGE_MESSAGE = 'No puede ser anterior al inicio estimado.';

function maxMessage(limit: number): string {
  return `Usa como máximo ${limit} caracteres.`;
}

/** Valor del selector de cliente: completo o sólo con el id (se resuelve con `GET /customers/{id}`). */
export type ProjectCustomerValue = { id: string; crmCode?: string; legalName?: string; countryId?: string };

// ---------------------------------------------------------------------------
// Datos generales (alta, edición)
// ---------------------------------------------------------------------------

export interface ProjectFormValues {
  name: string;
  customer: ProjectCustomerValue | null;
  countryId: string;
  city: string;
  address: string;
  description: string;
  /** `YYYY-MM-DD` del campo de fecha nativo, o `''`. */
  estimatedStartDate: string;
  estimatedEndDate: string;
  estimatedDecisionDate: string;
  owner: OwnerOption | null;
  code: string;
}

export type ProjectTextField = 'name' | 'countryId' | 'city' | 'address' | 'description' | 'estimatedStartDate' | 'estimatedEndDate' | 'estimatedDecisionDate' | 'code';

export const PROJECT_DATE_FORM_FIELDS = ['estimatedStartDate', 'estimatedEndDate', 'estimatedDecisionDate'] as const;

/** Campos de datos generales que el parámetro `crm.campos_obligatorios.project` puede exigir (E2a #1). */
const GENERAL_FIELDS: ReadonlySet<string> = new Set([
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
]);

/** Obligatorios del DTO aunque `requiredFields` no los traiga. */
const BASE_REQUIRED_FIELDS = ['name', 'customerId', 'countryId'] as const;

export interface ProjectSchemaContext {
  /** `form-options.requiredFields` (nombres del DTO). */
  requiredFields: readonly string[];
  /**
   * En el alta el asesor vacío no se envía y el backend asigna al actor
   * (RN-03.6): no se exige elegirlo aunque `ownerId` sea obligatorio.
   */
  ownerDefaultsToActor: boolean;
  /** Sólo se valida el asesor si el usuario puede elegirlo. */
  canChooseOwner: boolean;
}

/** Obligatorios de datos generales: base + los del parámetro que se capturan en este formulario. */
export function requiredGeneralFields(requiredFields: readonly string[]): Set<string> {
  return new Set([...BASE_REQUIRED_FIELDS, ...requiredFields.filter((field) => GENERAL_FIELDS.has(field))]);
}

export function buildProjectFormSchema({ requiredFields, ownerDefaultsToActor, canChooseOwner }: ProjectSchemaContext) {
  const required = requiredGeneralFields(requiredFields);
  const text = z.string();

  return z
    .object({
      name: text,
      customer: z.custom<ProjectCustomerValue | null>(),
      countryId: text,
      city: text,
      address: text,
      description: text,
      estimatedStartDate: text,
      estimatedEndDate: text,
      estimatedDecisionDate: text,
      owner: z.custom<OwnerOption | null>(),
      code: text,
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof ProjectFormValues, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      for (const field of ['name', 'city', 'address', 'description', 'code'] as const) {
        const limit = PROJECT_LIMITS[field];
        if (values[field].length > limit) {
          issue(field, maxMessage(limit));
        }
      }

      for (const field of required) {
        if (field === 'customerId') {
          if (!values.customer) {
            issue('customer', REQUIRED_MESSAGE);
          }
        } else if (field === 'ownerId') {
          if (canChooseOwner && !ownerDefaultsToActor && !values.owner) {
            issue('owner', REQUIRED_MESSAGE);
          }
        } else if (!values[field as ProjectTextField].trim()) {
          issue(field as ProjectTextField, REQUIRED_MESSAGE);
        }
      }

      for (const field of PROJECT_DATE_FORM_FIELDS) {
        if (values[field] && !isCalendarDate(values[field])) {
          issue(field, DATE_MESSAGE);
        }
      }

      // RN-03.4: fin ≥ inicio. Las fechas `YYYY-MM-DD` se comparan como texto.
      const start = values.estimatedStartDate;
      const end = values.estimatedEndDate;
      if (start && end && isCalendarDate(start) && isCalendarDate(end) && end < start) {
        issue('estimatedEndDate', DATE_RANGE_MESSAGE);
      }
    });
}

// ---------------------------------------------------------------------------
// Duplicado (F-12)
// ---------------------------------------------------------------------------

export interface DuplicateFormValues {
  name: string;
  customer: ProjectCustomerValue | null;
  estimatedStartDate: string;
  estimatedEndDate: string;
  estimatedDecisionDate: string;
  owner: OwnerOption | null;
  code: string;
  copyLocation: boolean;
  copyDescription: boolean;
  copyClassification: boolean;
  copyProducts: boolean;
}

export const duplicateFormSchema = z
  .object({
    name: z.string().trim().min(1, REQUIRED_MESSAGE).max(PROJECT_LIMITS.name, maxMessage(PROJECT_LIMITS.name)),
    customer: z.custom<ProjectCustomerValue | null>().refine((value) => value !== null, REQUIRED_MESSAGE),
    estimatedStartDate: z.string(),
    estimatedEndDate: z.string(),
    estimatedDecisionDate: z.string(),
    owner: z.custom<OwnerOption | null>(),
    code: z.string().max(PROJECT_LIMITS.code, maxMessage(PROJECT_LIMITS.code)),
    copyLocation: z.boolean(),
    copyDescription: z.boolean(),
    copyClassification: z.boolean(),
    copyProducts: z.boolean(),
  })
  .superRefine((values, ctx) => {
    for (const field of PROJECT_DATE_FORM_FIELDS) {
      if (values[field] && !isCalendarDate(values[field])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: DATE_MESSAGE });
      }
    }
    if (values.estimatedStartDate && values.estimatedEndDate && values.estimatedEndDate < values.estimatedStartDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedEndDate'], message: DATE_RANGE_MESSAGE });
    }
  });

// ---------------------------------------------------------------------------
// Clasificación (F-15)
// ---------------------------------------------------------------------------

export interface ClassificationFormValues {
  projectTypeId: string;
  sectorId: string;
  measureUnitId: string;
  /** Texto del `DecimalField` (cadena canónica si es válido). */
  estimatedQuantity: string;
  tonnageMode: TonnageMode;
  manualTonnage: string;
}

const CLASSIFICATION_FIELDS: ReadonlySet<string> = new Set(['projectTypeId', 'sectorId', 'measureUnitId', 'estimatedQuantity']);

function decimalIssue(value: string, spec: DecimalSpec, required: boolean): string | null {
  const parsed = parseDecimal(value, spec);
  if (parsed.ok) {
    return null;
  }
  if (parsed.issue === 'empty' && !required) {
    return null;
  }
  return describeDecimalIssue(parsed.issue, spec);
}

/**
 * RN-03.26: con `RULE`, unidad y cantidad; con `MANUAL`, el tonelaje. Los
 * obligatorios del parámetro que son de clasificación se exigen aquí (E2a #1).
 */
export function buildClassificationSchema(requiredFields: readonly string[]) {
  const required = new Set(requiredFields.filter((field) => CLASSIFICATION_FIELDS.has(field)));
  return z
    .object({
      projectTypeId: z.string(),
      sectorId: z.string(),
      measureUnitId: z.string(),
      estimatedQuantity: z.string(),
      tonnageMode: z.enum(['RULE', 'MANUAL', 'NONE']),
      manualTonnage: z.string(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof ClassificationFormValues, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      const ruleMode = values.tonnageMode === 'RULE';
      for (const field of ['projectTypeId', 'sectorId', 'measureUnitId'] as const) {
        if ((required.has(field) || (ruleMode && field === 'measureUnitId')) && !values[field]) {
          issue(field, ruleMode && field === 'measureUnitId' ? 'Con estimación por regla, elige la unidad.' : REQUIRED_MESSAGE);
        }
      }
      const quantityRequired = required.has('estimatedQuantity') || ruleMode;
      const quantityIssue = decimalIssue(values.estimatedQuantity, DECIMAL_SPECS.quantity, quantityRequired);
      if (quantityIssue) {
        issue('estimatedQuantity', quantityIssue);
      }
      if (values.tonnageMode === 'MANUAL') {
        const tonnageIssue = decimalIssue(values.manualTonnage, DECIMAL_SPECS.tonnage, true);
        if (tonnageIssue) {
          issue('manualTonnage', tonnageIssue);
        }
      }
    });
}

// ---------------------------------------------------------------------------
// Fase del cliente (F-16)
// ---------------------------------------------------------------------------

export interface PhaseChangeFormValues {
  phaseId: string;
  progress: string;
  comment: string;
}

export interface PhaseSchemaContext {
  phases: readonly PhaseOption[];
  /** `crm.proyectos.reglas_avance` por código de fase. */
  progressRules: Record<string, { progresoMinimo: number }>;
  currentPhaseId: string;
  /** Porcentaje vigente (cadena). */
  currentProgress: string;
}

/** Mínimo de avance que exige la fase (RN-03.34), como cadena decimal; `null` si no hay regla. */
export function minimumProgressFor(phaseCode: string | undefined, rules: PhaseSchemaContext['progressRules']): string | null {
  const minimum = phaseCode ? rules[phaseCode]?.progresoMinimo : undefined;
  return typeof minimum === 'number' && Number.isFinite(minimum) ? String(minimum) : null;
}

/** RN-03.33–RN-03.35: porcentaje 0–100 con 2 decimales, regla de avance y algún cambio. */
export function buildPhaseChangeSchema({ phases, progressRules, currentPhaseId, currentProgress }: PhaseSchemaContext) {
  return z
    .object({
      phaseId: z.string().min(1, REQUIRED_MESSAGE),
      progress: z.string(),
      comment: z.string().max(PROJECT_LIMITS.comment, maxMessage(PROJECT_LIMITS.comment)),
    })
    .superRefine((values, ctx) => {
      const parsed = parseDecimal(values.progress, DECIMAL_SPECS.percent);
      if (!parsed.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['progress'], message: describeDecimalIssue(parsed.issue, DECIMAL_SPECS.percent) });
        return;
      }
      const phase = phases.find((option) => option.id === values.phaseId);
      const minimum = minimumProgressFor(phase?.code, progressRules);
      if (minimum !== null && compareDecimals(parsed.value, minimum) < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['progress'], message: `Esta fase exige al menos ${minimum}%.` });
        return;
      }
      if (values.phaseId === currentPhaseId && compareDecimals(parsed.value, currentProgress) === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['progress'], message: 'Cambia la fase o el porcentaje.' });
      }
    });
}

// ---------------------------------------------------------------------------
// Producto asociado (F-19)
// ---------------------------------------------------------------------------

export interface ProjectProductFormValues {
  productId: string;
  quantity: string;
  unitId: string;
  statusId: string;
  notes: string;
}

export const projectProductFormSchema = z
  .object({
    productId: z.string().min(1, 'Elige un producto.'),
    quantity: z.string(),
    unitId: z.string().min(1, REQUIRED_MESSAGE),
    statusId: z.string(),
    notes: z.string().max(PROJECT_LIMITS.notes, maxMessage(PROJECT_LIMITS.notes)),
  })
  .superRefine((values, ctx) => {
    const quantityIssue = decimalIssue(values.quantity, DECIMAL_SPECS.quantity, true);
    if (quantityIssue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: quantityIssue });
    }
  });

/** Cadena canónica de un campo decimal ya validado (o `null` si está vacío). */
export function canonicalDecimal(value: string, spec: DecimalSpec): string | null {
  const parsed = parseDecimal(value, spec);
  return parsed.ok ? parsed.value : null;
}
