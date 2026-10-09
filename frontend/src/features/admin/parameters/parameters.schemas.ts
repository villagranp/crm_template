import { z } from 'zod';

import type { SystemParameter } from './parameters.api';

/**
 * Validación del valor en el cliente. Es experiencia de usuario: el backend
 * (`backend/src/modules/parameters/parameter-value.ts`) valida de nuevo y es
 * la autoridad; si los rangos cambian allí, el `422` lo explica igualmente.
 */

export const MAX_STRING_LENGTH = 1000;

/** Rangos de las claves conocidas (mismos valores que el backend). */
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

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Mensaje de error del valor, o `null` si es válido. */
export function validateParameterValue(parameter: Pick<SystemParameter, 'key' | 'type' | 'value'>, raw: string): string | null {
  const value = raw.trim();
  switch (parameter.type) {
    case 'NUMBER': {
      const integerOnly = INTEGER.test(parameter.value.trim());
      if (!(integerOnly ? INTEGER : DECIMAL).test(value)) {
        return integerOnly ? 'Debe ser un número entero.' : 'Debe ser un número.';
      }
      const range = PARAMETER_RANGES[parameter.key];
      const parsed = Number(value);
      if (range && (parsed < range.min || parsed > range.max)) {
        return `Debe estar entre ${range.min} y ${range.max}.`;
      }
      return null;
    }
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? null : 'Debe ser sí o no.';
    case 'JSON':
      return isJson(value) ? null : 'Debe ser JSON válido.';
    case 'DATE':
      return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? null : 'Debe ser una fecha válida.';
    case 'STRING':
    default:
      return value.length >= 1 && value.length <= MAX_STRING_LENGTH
        ? null
        : `Debe tener entre 1 y ${MAX_STRING_LENGTH} caracteres.`;
  }
}

export function parameterFormSchema(parameter: Pick<SystemParameter, 'key' | 'type' | 'value'>) {
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
