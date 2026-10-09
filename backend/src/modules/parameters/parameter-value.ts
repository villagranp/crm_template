import { BusinessRuleViolationError } from '@/common/errors/application-error';

import type { ParameterValueType } from './ports/parameters.repository.port';

/**
 * Validación del valor de un parámetro del sistema (PLAN-ADMIN, D10).
 *
 * Reglas por tipo:
 * - `NUMBER`: número finito. Si el valor actual es entero, el nuevo también
 *   debe serlo (el código que lo lee hace `parseInt`).
 * - `BOOLEAN`: exactamente `true` o `false`.
 * - `JSON`: JSON válido; se guarda compactado.
 * - `DATE`: fecha ISO 8601 (`2026-10-08` o `2026-10-08T10:00:00Z`).
 * - `STRING`: entre 1 y `MAX_STRING_LENGTH` caracteres tras recortar espacios.
 *
 * Además, las claves que lee el código tienen rangos (`PARAMETER_RANGES`):
 * un valor fuera de rango desactivaría un control de seguridad o rompería
 * una pantalla. Los rangos son de seguridad operativa, no de negocio.
 */

export const INVALID_PARAMETER_VALUE = 'INVALID_PARAMETER_VALUE';

export const MAX_STRING_LENGTH = 1000;
export const MAX_JSON_LENGTH = 10_000;

export interface NumericRange {
  min: number;
  max: number;
}

/**
 * Rangos permitidos de las claves conocidas. Documentados también en la
 * descripción de `PATCH /parameters/{key}` (OpenAPI).
 *
 * - Intentos fallidos antes de bloquear: 1–20. Con 0 no habría bloqueo.
 * - Minutos de bloqueo: 1–1440 (un día).
 * - Días de caducidad de contraseña: 0–365 (0 = sin caducidad).
 * - Días de retención de auditoría: 30–3650. Menos de 30 impide investigar un incidente.
 * - Tamaño de página por defecto: 1–100 (`MAX_PAGE_SIZE` de la API).
 */
export const PARAMETER_RANGES: Readonly<Record<string, NumericRange>> = {
  'seguridad.intentos_fallidos_maximos': { min: 1, max: 20 },
  'seguridad.minutos_bloqueo': { min: 1, max: 1440 },
  'seguridad.dias_caducidad_password': { min: 0, max: 365 },
  'auditoria.dias_retencion': { min: 30, max: 3650 },
  'ui.paginacion_default': { min: 1, max: 100 },
};

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

export interface ParameterDefinition {
  key: string;
  type: ParameterValueType;
  /** Valor actual: decide si un `NUMBER` es entero o decimal. */
  value: string;
}

function invalid(key: string, issue: string): BusinessRuleViolationError {
  return new BusinessRuleViolationError(INVALID_PARAMETER_VALUE, 'The value is not valid for this parameter', [
    { field: 'value', key, issue },
  ]);
}

function normalizeNumber(parameter: ParameterDefinition, raw: string): string {
  const integerOnly = INTEGER.test(parameter.value.trim());
  const pattern = integerOnly ? INTEGER : DECIMAL;
  if (!pattern.test(raw)) {
    throw invalid(parameter.key, integerOnly ? 'Debe ser un número entero' : 'Debe ser un número');
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (integerOnly && !Number.isSafeInteger(parsed))) {
    throw invalid(parameter.key, 'El número está fuera de rango');
  }

  const range = PARAMETER_RANGES[parameter.key];
  if (range && (parsed < range.min || parsed > range.max)) {
    throw invalid(parameter.key, `Debe estar entre ${range.min} y ${range.max}`);
  }
  return String(parsed);
}

function normalizeDate(key: string, raw: string): string {
  if (!ISO_DATE.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw invalid(key, 'Debe ser una fecha ISO 8601 (AAAA-MM-DD)');
  }
  return raw;
}

function normalizeJson(key: string, raw: string): string {
  if (raw.length > MAX_JSON_LENGTH) {
    throw invalid(key, `No puede superar ${MAX_JSON_LENGTH} caracteres`);
  }
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    throw invalid(key, 'Debe ser JSON válido');
  }
}

/**
 * Valida `raw` para el parámetro y devuelve el valor normalizado que se guarda.
 * Lanza `422 INVALID_PARAMETER_VALUE` con el motivo en `details[].issue`.
 */
export function normalizeParameterValue(parameter: ParameterDefinition, raw: string): string {
  const value = raw.trim();

  switch (parameter.type) {
    case 'NUMBER':
      return normalizeNumber(parameter, value);
    case 'BOOLEAN':
      if (value !== 'true' && value !== 'false') {
        throw invalid(parameter.key, 'Debe ser true o false');
      }
      return value;
    case 'JSON':
      return normalizeJson(parameter.key, value);
    case 'DATE':
      return normalizeDate(parameter.key, value);
    case 'STRING':
    default:
      if (value.length === 0 || value.length > MAX_STRING_LENGTH) {
        throw invalid(parameter.key, `Debe tener entre 1 y ${MAX_STRING_LENGTH} caracteres`);
      }
      return value;
  }
}
