import type { ForecastLineWrite } from './ports/forecast.repository.port';

/** `resourceType` y eventos de auditoría del forecast (03 RN-03.76). */
export const FORECAST_LINE_AUDIT_RESOURCE = 'crm.forecast_line';

export const FORECAST_LINE_AUDIT_EVENTS = {
  created: 'crm.forecast_line.created',
  updated: 'crm.forecast_line.updated',
} as const;

/** Texto libre que puede contener datos personales: se audita que cambió, no su contenido. */
export const FORECAST_LINE_MASKED_FIELDS = ['notes'] as const;

/** Estado auditable de una línea (ids y valores de empresa). */
export function forecastLineAuditState(line: ForecastLineWrite): Record<string, unknown> {
  return {
    quantity: line.quantity,
    unitId: line.unitId,
    conversionRuleId: line.conversionRuleId,
    conversionFactor: line.conversionFactor,
    tonnage: line.tonnage,
    ownerId: line.ownerId,
    notes: line.notes,
  };
}
