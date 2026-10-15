import { z } from 'zod';

import { ALERT_TYPES } from './components/editors/editor-metadata';
import type { SystemParameter } from './parameters.api';

/**
 * Validación del valor en el cliente. Es experiencia de usuario: el backend
 * (`backend/src/modules/parameters/parameter-value.ts`) valida de nuevo y es
 * la autoridad; si los rangos cambian allí, el `422` lo explica igualmente.
 */

export const MAX_STRING_LENGTH = 1000;

/**
 * Rangos de las claves conocidas (mismos valores que el backend). Respaldo para
 * cuando la respuesta no trae `range` (07 F.5 lo añade a cada parámetro).
 */
export const PARAMETER_RANGES: Readonly<Record<string, { min: number; max: number }>> = {
  'seguridad.intentos_fallidos_maximos': { min: 1, max: 20 },
  'seguridad.minutos_bloqueo': { min: 1, max: 1440 },
  'seguridad.dias_caducidad_password': { min: 0, max: 365 },
  'auditoria.dias_retencion': { min: 30, max: 3650 },
  'ui.paginacion_default': { min: 1, max: 100 },
};

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

function parseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

type ValidatedParameter = Pick<SystemParameter, 'key' | 'type' | 'value'> &
  Partial<Pick<SystemParameter, 'range' | 'allowedValues' | 'editor'>>;

/**
 * Comprobaciones de UX de los editores estructurados que el control no impide
 * por sí solo. El backend aplica el esquema completo (D-07.7).
 */
function validateStructured(editor: string | null | undefined, value: unknown): string | null {
  switch (editor) {
    case 'progress-rules': {
      const rules = Object.values((value ?? {}) as Record<string, { progresoMinimo?: unknown }>);
      const outOfRange = rules.some(
        (rule) => typeof rule?.progresoMinimo !== 'number' || rule.progresoMinimo < 0 || rule.progresoMinimo > 100,
      );
      return outOfRange ? 'El avance mínimo debe estar entre 0 y 100.' : null;
    }
    case 'priority-map': {
      const map = (value ?? {}) as Record<string, unknown>;
      return ALERT_TYPES.every(({ code }) => typeof map[code] === 'string' && map[code] !== '')
        ? null
        : 'Elige una prioridad para cada tipo de alerta.';
    }
    case 'mime-types':
      return Array.isArray(value) && value.length > 0 ? null : 'Elige al menos un tipo de archivo.';
    default:
      return null;
  }
}

/** Rango del parámetro: el de la API y, si no viene, el conocido. */
export function rangeOf(parameter: ValidatedParameter): { min: number; max: number } | undefined {
  return parameter.range ?? PARAMETER_RANGES[parameter.key];
}

/** Mensaje de error del valor, o `null` si es válido. */
export function validateParameterValue(parameter: ValidatedParameter, raw: string): string | null {
  const value = raw.trim();
  if (parameter.type === 'STRING' && parameter.allowedValues && parameter.allowedValues.length > 0) {
    return parameter.allowedValues.includes(value) ? null : 'Elige uno de los valores permitidos.';
  }
  switch (parameter.type) {
    case 'NUMBER': {
      const integerOnly = INTEGER.test(parameter.value.trim());
      if (!(integerOnly ? INTEGER : DECIMAL).test(value)) {
        return integerOnly ? 'Debe ser un número entero.' : 'Debe ser un número.';
      }
      const range = rangeOf(parameter);
      const parsed = Number(value);
      if (range && (parsed < range.min || parsed > range.max)) {
        return `Debe estar entre ${range.min} y ${range.max}.`;
      }
      return null;
    }
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? null : 'Debe ser sí o no.';
    case 'JSON': {
      const parsed = parseJson(value);
      return parsed.ok ? validateStructured(parameter.editor, parsed.value) : 'Debe ser JSON válido.';
    }
    case 'DATE':
      return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? null : 'Debe ser una fecha válida.';
    case 'STRING':
    default:
      return value.length >= 1 && value.length <= MAX_STRING_LENGTH
        ? null
        : `Debe tener entre 1 y ${MAX_STRING_LENGTH} caracteres.`;
  }
}

export function parameterFormSchema(parameter: ValidatedParameter) {
  return z.object({
    value: z.string().superRefine((value, context) => {
      const message = validateParameterValue(parameter, value);
      if (message) {
        context.addIssue({ code: z.ZodIssueCode.custom, message });
      }
    }),
  });
}

export type ParameterFormValues = z.infer<ReturnType<typeof parameterFormSchema>>;
