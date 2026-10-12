/**
 * Reglas puras de los folios (00 §6.1). Sin base de datos: las prueba
 * `sequence-format.spec.ts` y las aplica `PrismaSequenceGenerator`.
 */

export type SequenceResetPolicy = 'NONE' | 'YEAR' | 'MONTH';

export interface SequenceDefinition {
  readonly prefix: string;
  readonly pattern: string;
  readonly padding: number;
  readonly resetPolicy: SequenceResetPolicy;
}

export interface CalendarParts {
  readonly year: string;
  readonly month: string;
}

/** Año y mes del instante en la zona indicada (`2026`, `03`). */
export function calendarPartsAt(at: Date, timeZone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) {
    throw new Error(`Cannot compute the calendar period in time zone ${timeZone}`);
  }
  return { year, month };
}

/** Clave del periodo de reinicio (`2026`, `2026-03`) o `null` si la secuencia no reinicia. */
export function periodKeyFor(policy: SequenceResetPolicy, parts: CalendarParts): string | null {
  switch (policy) {
    case 'YEAR':
      return parts.year;
    case 'MONTH':
      return `${parts.year}-${parts.month}`;
    case 'NONE':
      return null;
  }
}

/**
 * Siguiente valor del contador: vuelve a 1 si la política reinicia y el periodo
 * guardado es otro (incluido `null`, la primera vez).
 */
export function nextCounterValue(currentValue: number, storedPeriodKey: string | null, newPeriodKey: string | null): number {
  if (newPeriodKey !== null && storedPeriodKey !== newPeriodKey) {
    return 1;
  }
  return currentValue + 1;
}

/** Aplica el patrón. `padding` rellena con ceros a la izquierda y nunca trunca. */
export function formatSequenceCode(definition: SequenceDefinition, value: number, parts: CalendarParts): string {
  const seq = String(value).padStart(Math.max(definition.padding, 0), '0');
  return definition.pattern
    .replaceAll('{prefix}', definition.prefix)
    .replaceAll('{year}', parts.year)
    .replaceAll('{month}', parts.month)
    .replaceAll('{seq}', seq);
}

export function isSequenceResetPolicy(value: string): value is SequenceResetPolicy {
  return value === 'NONE' || value === 'YEAR' || value === 'MONTH';
}
