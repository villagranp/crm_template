import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

import type { CurrencyRecord } from './exchange-rate.reader.port';

export const EXCHANGE_RATE_REPOSITORY = Symbol('EXCHANGE_RATE_REPOSITORY');

/** Campos ordenables de la lista de tipos de cambio (lista blanca, 07 F.7). */
export const EXCHANGE_RATE_SORT_FIELDS = ['effectiveDate', 'currencyCode', 'createdAt', 'updatedAt'] as const;
export type ExchangeRateSortField = (typeof EXCHANGE_RATE_SORT_FIELDS)[number];

/** Fila completa de `exchange_rates` para el mantenimiento (07 F.7, RN-07.44). */
export interface ExchangeRateDetailRecord {
  readonly id: string;
  readonly currencyCode: string;
  readonly effectiveDate: CalendarDate;
  /** `Decimal(19, 8)` con 8 decimales (`'7.75000000'`). */
  readonly ratePerUsd: DecimalString;
  readonly source: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Último usuario que la escribió (en el alta, quien la registró); `null` en la semilla. */
  readonly updatedBy: { readonly id: string; readonly displayName: string } | null;
}

export interface ExchangeRateSearch extends PageRequest {
  readonly currencyCode: string | null;
  /** Vigencia desde (incluida). */
  readonly from: CalendarDate | null;
  /** Vigencia hasta (incluida). */
  readonly to: CalendarDate | null;
  readonly sortBy: ExchangeRateSortField;
  readonly sortOrder: 'asc' | 'desc';
}

export interface CreateExchangeRateInput {
  readonly currencyCode: string;
  readonly effectiveDate: CalendarDate;
  readonly ratePerUsd: DecimalString;
  readonly source: string;
  readonly notes: string | null;
}

/** Solo lo corregible (RN-07.44): `currencyCode` y `effectiveDate` son inmutables. */
export interface UpdateExchangeRateInput {
  readonly ratePerUsd?: DecimalString;
  readonly source?: string;
  readonly notes?: string | null;
}

/** Resultado de un alta: la fila, o el aviso de que ya hay una para esa moneda y fecha. */
export type CreateExchangeRateResult =
  | { readonly ok: true; readonly record: ExchangeRateDetailRecord }
  | { readonly ok: false; readonly reason: 'DUPLICATE' };

/**
 * Mantenimiento de tipos de cambio y consulta de monedas (07 F.7, RN-07.44, ADR-024).
 * Puerto de **escritura** del Módulo 7; las lecturas que necesitan otros módulos
 * (tasa vigente a una fecha) siguen yendo por `ExchangeRateReader`. Sin borrado ni
 * desactivación: no hay método para ello. Sin tipos del ORM (ADR-004).
 */
export interface ExchangeRateRepository {
  search(search: ExchangeRateSearch): Promise<Page<ExchangeRateDetailRecord>>;
  findById(id: string): Promise<ExchangeRateDetailRecord | null>;
  /** Todas las monedas (activas o no), por código. Solo lectura (D-07.13). */
  listCurrencies(): Promise<CurrencyRecord[]>;
  findCurrency(code: string): Promise<CurrencyRecord | null>;
  /**
   * Inserta la fila con `createdById = updatedById = actorId`. Si ya existe una para
   * `(currencyCode, effectiveDate)` (`uq_exchange_rates_currency_effective_date`)
   * devuelve `DUPLICATE` en lugar de lanzar.
   */
  create(input: CreateExchangeRateInput, actorId: string | null): Promise<CreateExchangeRateResult>;
  /** Corrige tasa, fuente o notas; `null` si la fila no existe. */
  update(id: string, input: UpdateExchangeRateInput, actorId: string | null): Promise<ExchangeRateDetailRecord | null>;
}
