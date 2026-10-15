import { formatCalendarDate } from '@/features/crm/commercial-activity/entry-points';
import { formatDecimal } from '@/features/crm/common/decimal';

import { BASE_CURRENCY, EMPTY, formatTons, formatUsd } from '../common/report-format';

import type { LocalCurrencyReference, OpportunityReportEstimate, OpportunityReportRow, OpportunityStatusFilter } from './opportunities-report.api';

/** Textos del reporte de oportunidades (05 E.3). */

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatusFilter, string> = {
  OPEN: 'Abiertas',
  CLOSED: 'Cerradas',
  WON: 'Ganadas (incluye parciales)',
  PARTIAL: 'Parciales',
  LOST: 'Perdidas',
  CLOSED_NO_RESULT: 'Cerradas sin resultado',
};

export const OPPORTUNITY_DATE_BASIS_LABELS = {
  IDENTIFIED: 'Fecha de identificación',
  DECIDED: 'Fecha de decisión',
  UPDATED: 'Fecha de actualización',
} as const;

/** Aviso de C.2 / AC-05.8: con `DECIDED` sólo entran las que tienen resultado. */
export const DECIDED_BASIS_NOTE = 'Con la fecha de decisión solo entran las oportunidades con resultado registrado.';

/** Resultado de la fila (AC-05.6): "Ganado", "Parcial 60 %" o "Perdido · <motivo>"; sin resultado, `—`. */
export function resultText(result: OpportunityReportRow['result']): string {
  if (!result) {
    return EMPTY;
  }
  switch (result.outcome) {
    case 'WON':
      return 'Ganado';
    case 'PARTIAL': {
      const percent = formatDecimal(result.awardedPercent, { maxFractionDigits: 2 });
      return percent === EMPTY ? 'Parcial' : `Parcial ${percent} %`;
    }
    case 'LOST':
      return result.reason ? `Perdido · ${result.reason.label}` : 'Perdido';
  }
}

/**
 * Estimación de la fila (RN-05.29, AC-05.44): el monto original con su moneda y, si no es
 * USD, su equivalente en USD; las toneladas aparte. Nunca suma monedas.
 */
export function estimateLines(estimate: OpportunityReportEstimate): { original: string; usd: string | null; tonnage: string | null } {
  const original = estimate.amount !== null ? formatUsd(estimate.amount, estimate.currencyCode ?? BASE_CURRENCY) : EMPTY;
  const isBase = (estimate.currencyCode ?? BASE_CURRENCY) === BASE_CURRENCY;
  const usd = !isBase && estimate.amountUsd !== null ? `≈ ${formatUsd(estimate.amountUsd)}` : null;
  const tonnage = estimate.tonnage !== null ? formatTons(estimate.tonnage) : null;
  return { original, usd, tonnage };
}

/** "Fecha de decisión" (RN-05.28): la real, o la estimada del proyecto marcada "(estimada)". */
export function decisionDateText(row: Pick<OpportunityReportRow, 'decisionDate' | 'decisionDateKind'>): string {
  if (!row.decisionDate) {
    return EMPTY;
  }
  const date = formatCalendarDate(row.decisionDate);
  return row.decisionDateKind === 'ESTIMATED' ? `${date} (estimada)` : date;
}

/** Referencia en moneda local (RN-05.58, PF-05.46): "≈ GTQ 968,750.00 (referencial, tasa del 1 oct 2026)". */
export function localReferenceText(reference: LocalCurrencyReference): string {
  return `≈ ${formatUsd(reference.amount, reference.currencyCode)} (${reference.label}, tasa del ${formatCalendarDate(reference.exchangeRateDate)})`;
}
