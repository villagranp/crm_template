import { formatCount, formatReportPercent } from '../common/report-format';

import type { FunnelStage, FunnelUnavailableReason } from './funnel.api';

/**
 * Textos del embudo (05 E.8, AC-05.36, AC-05.37): un porcentaje `null` se muestra "—" con su
 * motivo, nunca "0 %".
 */

export const NOT_CALCULABLE = '—';

/** Motivo legible de un porcentaje no calculable (E.8). */
export function unavailableReasonText(reason: FunnelUnavailableReason, sampleMinimum: number): string {
  switch (reason) {
    case 'NO_DATA':
      return 'Sin datos';
    case 'INSUFFICIENT_HISTORY':
      return 'Historial insuficiente';
    case 'INSUFFICIENT_SAMPLE':
      return `Muestra insuficiente (menos de ${formatCount(sampleMinimum)} oportunidades)`;
  }
}

/**
 * Motivo por el que **este** porcentaje es `null`. La participación sólo falta sin datos
 * (RN-05.54); la conversión, por el motivo del contrato (RN-05.55).
 */
export function shareReason(stage: FunnelStage): FunnelUnavailableReason | null {
  return stage.shareOfTotal === null ? 'NO_DATA' : null;
}

export function conversionReason(stage: FunnelStage): FunnelUnavailableReason | null {
  return stage.cumulativeConversion === null ? (stage.unavailableReason ?? 'NO_DATA') : null;
}

/** Porcentaje legible o "—". */
export function percentText(value: string | null): string {
  return value === null ? NOT_CALCULABLE : formatReportPercent(value);
}

/** Texto junto a la barra: cantidad y, si se puede calcular, la participación ("4 · 42.86 %"). */
export function barLabelText(stage: FunnelStage): string {
  return stage.shareOfTotal === null ? formatCount(stage.count) : `${formatCount(stage.count)} · ${formatReportPercent(stage.shareOfTotal)}`;
}
