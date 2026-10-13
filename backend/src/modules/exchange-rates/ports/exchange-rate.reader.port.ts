import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

export const EXCHANGE_RATE_READER = Symbol('EXCHANGE_RATE_READER');

/** Moneda ISO 4217 (`currencies`, 00 §2.16). */
export interface CurrencyRecord {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  /** Decimales de presentación (el almacenamiento siempre es `Decimal(19, 4)`). */
  readonly decimals: number;
  readonly isActive: boolean;
}

/** Fila de `exchange_rates`: unidades de la moneda por 1 USD vigentes desde `effectiveDate`. */
export interface ExchangeRateRecord {
  readonly currencyCode: string;
  readonly effectiveDate: CalendarDate;
  /** `Decimal(19, 8)` como texto con 8 decimales (`'7.75000000'`). */
  readonly ratePerUsd: DecimalString;
  readonly source: string;
}

/**
 * Puerto de lectura de monedas y tipos de cambio (ADR-024, 00 §2.16 y §11). Solo
 * lectura: el mantenimiento (`ExchangeRateRepository`) es del Módulo 7 (07 F.7) y
 * se añadirá en este mismo módulo. Sin tipos del ORM (ADR-004).
 */
export interface ExchangeRateReader {
  /**
   * Regla de búsqueda de 00 §2.16: la fila de `currencyCode` con **mayor
   * `effective_date` ≤ `date`** (`ORDER BY effective_date DESC LIMIT 1`, servida por
   * `uq_exchange_rates_currency_effective_date`), o `null` si no hay ninguna. La
   * base nunca tiene filas de USD (`ck_exchange_rates_not_base`): la identidad de
   * la moneda base la resuelve `CurrencyConversionService`, no este puerto.
   */
  findApplicable(currencyCode: string, date: CalendarDate, tx?: TransactionContext): Promise<ExchangeRateRecord | null>;
  /** Monedas con esos códigos, activas o no, en cualquier orden. Las inexistentes no aparecen. */
  findCurrencies(codes: readonly string[], tx?: TransactionContext): Promise<CurrencyRecord[]>;
  /** `countries.currency_code` del país, o `null` si el país no existe. */
  findCountryCurrencyCode(countryId: string, tx?: TransactionContext): Promise<string | null>;
}
