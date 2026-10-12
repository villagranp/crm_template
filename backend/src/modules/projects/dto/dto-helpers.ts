import { registerDecorator, type ValidationOptions } from 'class-validator';

import { isCalendarDate } from '@/common/calendar-date';

/** Máximo de valores de un filtro repetible. */
export const MAX_FILTER_VALUES = 50;

/** Cantidades, tonelajes y montos: hasta 15 enteros y 4 decimales (03 H.3). El signo lo valida el caso de uso (`422`). */
export const QUANTITY_PATTERN = /^-?\d{1,15}(\.\d{1,4})?$/;
/** Porcentajes: hasta 3 enteros y 2 decimales (03 H.3). El rango 0–100 lo valida el caso de uso (`422 INVALID_PROGRESS`). */
export const PROGRESS_PATTERN = /^-?\d{1,3}(\.\d{1,2})?$/;

/**
 * Filtro repetible (03 "Precisiones de implementación"): valores separados por comas
 * (`phaseId=a,b`) o el parámetro repetido (`phaseId=a&phaseId=b`). Vacíos fuera.
 */
export function toList({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) return value;
  const parts = (Array.isArray(value) ? value : [value]).flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]));
  return parts.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== '');
}

/** Fecha de calendario `YYYY-MM-DD` real (DM-31). */
export function IsCalendarDateString(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCalendarDateString',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `${String(propertyName)} must be a calendar date (YYYY-MM-DD)`, ...options },
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    });
  };
}

/** Campo anulable de un PATCH: `null` borra y no se valida; omitido = sin cambio. */
export function isNotNull(_object: object, value: unknown): boolean {
  return value !== null && value !== undefined;
}
