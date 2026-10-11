/**
 * Tipos de cambio iniciales (00 §8.2, DM-36, ADR-024).
 *
 * VACÍO A PROPÓSITO. Los valores reales (GTQ, HNL, CRC, VES frente a 1 USD, con
 * fecha de vigencia y fuente) los entrega el negocio antes del primer
 * despliegue; no se inventan. Mientras esta lista esté vacía no se puede
 * registrar una estimación en moneda local (`422 EXCHANGE_RATE_NOT_FOUND`).
 *
 * Al recibirlos, añadir una entrada por moneda, p. ej.:
 *   { currencyCode: 'GTQ', effectiveDate: '2026-10-01', ratePerUsd: '7.75000000', source: 'Banco de Guatemala' }
 *
 * La semilla es idempotente por (currencyCode, effectiveDate) y NO pisa una tasa
 * ya corregida desde Administración. La semilla de demostración usa sus propias
 * tasas ilustrativas, marcadas como demo.
 */
export interface ExchangeRateSeed {
  currencyCode: string;
  /** Fecha de vigencia, `YYYY-MM-DD`. */
  effectiveDate: string;
  /** Unidades de la moneda por 1 USD, como texto decimal. */
  ratePerUsd: string;
  source: string;
  notes?: string;
}

export const INITIAL_EXCHANGE_RATES: ExchangeRateSeed[] = [];
