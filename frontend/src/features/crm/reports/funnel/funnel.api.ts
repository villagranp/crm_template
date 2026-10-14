import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';

import type { ReportLabelRef } from '../common/report-types';

/**
 * Embudo comercial (05 F-41, E.8, P-05.15): `GET /reports/funnel`, espejo de `SalesFunnelDto`.
 * Porcentajes como cadena con dos decimales o `null` con su motivo (nunca 0 % inventado).
 */

/** Filtros del embudo (F.2 `FunnelQueryDto`); período opcional por `opportunity_date`. Un valor por filtro en la URL (P-05.19). */
export const FUNNEL_FILTER_KEYS = ['stageId', 'customerId', 'companyTypeId', 'ownerId', 'countryId'] as const;
export type FunnelFilterKey = (typeof FUNNEL_FILTER_KEYS)[number];

export const FUNNEL_UNAVAILABLE_REASONS = ['NO_DATA', 'INSUFFICIENT_HISTORY', 'INSUFFICIENT_SAMPLE'] as const;
export type FunnelUnavailableReason = (typeof FUNNEL_UNAVAILABLE_REASONS)[number];

export interface FunnelStage {
  stage: ReportLabelRef & { code: string; order: number };
  /** Oportunidades cuya etapa **vigente** es esta (RN-05.53). */
  count: number;
  /** % del total del embudo (RN-05.54); `null` si el total es 0. */
  shareOfTotal: string | null;
  /** Conversión acumulada (RN-05.55); `null` con motivo. */
  cumulativeConversion: string | null;
  unavailableReason: FunnelUnavailableReason | null;
}

export interface SalesFunnel {
  stages: FunnelStage[];
  /** Oportunidades del conjunto en etapas del embudo, sin el filtro de etapa (RN-05.56). */
  totalInFunnel: number;
  /** `MIN_FUNNEL_SAMPLE` (D-05.9). */
  sampleMinimum: number;
}

export function getSalesFunnel(query: ListQuery): Promise<SalesFunnel> {
  return httpClient.get<SalesFunnel>('/reports/funnel', { query });
}
