import { describeApiError, type ApiErrorView } from '@/features/admin/common';

/**
 * Motivos de `422 INVALID_EXCHANGE_RATE` (`details[].issue`, 07 F.7) en español.
 * Un motivo desconocido se muestra tal cual llega.
 */
const ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  base_currency: 'USD es la moneda base y no lleva tipo de cambio.',
  inactive_currency: 'La moneda está inactiva.',
  unknown_currency: 'La moneda no existe.',
  non_positive_rate: 'La tasa debe ser mayor que 0.',
};

/** `describeApiError` con los motivos de tipo de cambio traducidos. */
export function describeExchangeRateError(error: unknown): ApiErrorView {
  const view = describeApiError(error);
  return { ...view, issues: view.issues.map((issue) => ISSUE_MESSAGES[issue] ?? issue) };
}
