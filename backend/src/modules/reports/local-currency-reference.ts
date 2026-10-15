import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import { type DecimalString, multiplyDecimal } from '@/common/decimal';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import { businessToday } from '@/modules/commercial-metrics/commercial-period';
import type { MetricClock } from '@/modules/commercial-metrics/metric-definitions';
import { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';

import { REPORTING_REPOSITORY, type ReportingRepository } from './ports/reporting.repository.port';

/** Decimales del equivalente referencial (RN-05.58: 4 decimales `HALF_UP`). */
export const LOCAL_REFERENCE_DECIMALS = 4;

export const LOCAL_REFERENCE_UNAVAILABLE_REASONS = ['MULTIPLE_COUNTRIES', 'BASE_CURRENCY', 'EXCHANGE_RATE_NOT_FOUND'] as const;
export type LocalReferenceUnavailableReason = (typeof LOCAL_REFERENCE_UNAVAILABLE_REASONS)[number];

/** Equivalente del total en USD en la moneda local de un único país (solo presentación, RN-05.58). */
export interface LocalCurrencyReference {
  readonly currencyCode: string;
  readonly amount: DecimalString;
  /** Unidades de la moneda por 1 USD aplicadas (8 decimales). */
  readonly exchangeRate: DecimalString;
  /** Vigencia de la tasa usada (la de mayor `effective_date` ≤ `cutDate`). */
  readonly exchangeRateDate: CalendarDate;
  readonly cutDate: CalendarDate;
  readonly label: 'referencial';
}

export type LocalReferenceResult =
  | { readonly reference: LocalCurrencyReference; readonly unavailableReason: null }
  | { readonly reference: null; readonly unavailableReason: LocalReferenceUnavailableReason };

/**
 * Conjunto de países **efectivo** del reporte (RN-05.58): el filtro `countryId` si viene;
 * si no, el país del alcance `COUNTRY` (uno por usuario, DM-14); en otro caso no hay un
 * país determinado (`null`).
 */
export function effectiveCountryIds(filterCountryIds: readonly string[], scope: VisibilityScope): readonly string[] | null {
  if (filterCountryIds.length > 0) return [...new Set(filterCountryIds)];
  if (scope.kind === 'FILTERED' && scope.dataScope === 'COUNTRY') return scope.countryIds;
  return null;
}

/** Fecha de corte (RN-05.58): `to` del período si se indica; si no, hoy en la zona del negocio. */
export function referenceCutDate(periodTo: CalendarDate | null, clock: MetricClock): CalendarDate {
  return periodTo ?? businessToday(clock);
}

/** Total USD × tasa (unidades por 1 USD), aritmética decimal exacta, 4 decimales `HALF_UP` (PF-05.44). */
export function localReferenceAmount(totalUsd: DecimalString, ratePerUsd: DecimalString): DecimalString {
  return multiplyDecimal(totalUsd, ratePerUsd, LOCAL_REFERENCE_DECIMALS);
}

export interface LocalReferenceInput {
  readonly filterCountryIds: readonly string[];
  readonly scope: VisibilityScope;
  /** Total del resumen, en USD (`estimateTotals.amountUsd`). */
  readonly totalUsd: DecimalString;
  readonly periodTo: CalendarDate | null;
  readonly clock: MetricClock;
}

/**
 * Referencia en moneda local (RN-05.58, ADR-024). Nunca sustituye al total en USD, no
 * se usa en ningún indicador y nunca es un error: si no aplica devuelve el motivo
 * (`MULTIPLE_COUNTRIES`, `BASE_CURRENCY`, `EXCHANGE_RATE_NOT_FOUND`). Un país filtrado
 * que no existe se trata como `MULTIPLE_COUNTRIES` (no hay un país determinado).
 */
@Injectable()
export class LocalCurrencyReferenceService {
  constructor(
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
    private readonly currencies: CurrencyConversionService,
  ) {}

  async resolve(input: LocalReferenceInput): Promise<LocalReferenceResult> {
    const countryIds = effectiveCountryIds(input.filterCountryIds, input.scope);
    if (!countryIds || countryIds.length !== 1) return { reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' };
    const [country] = await this.reporting.countryCurrencies(countryIds);
    if (!country) return { reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' };
    if (country.currencyCode === (await this.currencies.baseCurrencyCode())) return { reference: null, unavailableReason: 'BASE_CURRENCY' };

    const cutDate = referenceCutDate(input.periodTo, input.clock);
    const rate = await this.currencies.findApplicable(country.currencyCode, cutDate);
    if (!rate || rate.effectiveDate === null) return { reference: null, unavailableReason: 'EXCHANGE_RATE_NOT_FOUND' };
    return {
      reference: {
        currencyCode: country.currencyCode,
        amount: localReferenceAmount(input.totalUsd, rate.ratePerUsd),
        exchangeRate: rate.ratePerUsd,
        exchangeRateDate: rate.effectiveDate,
        cutDate,
        label: 'referencial',
      },
      unavailableReason: null,
    };
  }
}
