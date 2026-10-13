import { Inject, Injectable } from '@nestjs/common';

import { type CalendarDate, isCalendarDate } from '@/common/calendar-date';
import { type DecimalString, roundDecimal } from '@/common/decimal';
import type { ApplicationWarning } from '@/common/warnings';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { currencyNotAllowedError, exchangeRateNotFoundError } from './exchange-rate-errors';
import {
  allowedCurrencyCodes,
  amountInBaseCurrency,
  AMOUNT_SCALE,
  type AppliedExchangeRate,
  baseCurrencyRate,
  fromExchangeRateRecord,
  staleExchangeRateWarning,
} from './exchange-rate-rules';
import { type CurrencyRecord, EXCHANGE_RATE_READER, type ExchangeRateReader } from './ports/exchange-rate.reader.port';

export const BASE_CURRENCY_PARAMETER = 'crm.moneda_base';
export const STALE_RATE_DAYS_PARAMETER = 'crm.tipos_cambio.dias_aviso_antiguedad';

/** Moneda ofrecida en un formulario (`OpportunityFormOptionsDto.currencies.allowed[]`, 03 F.2). */
export interface CurrencyOption {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface AllowedCurrencies {
  /** `crm.moneda_base` (`USD`). */
  readonly baseCurrencyCode: string;
  /** La del país si está admitida; si no (inactiva), la base. */
  readonly defaultCurrencyCode: string;
  /** Base primero y la del país después, sin repetir; solo monedas existentes y activas. */
  readonly allowed: readonly CurrencyOption[];
}

export interface CurrencyCheckOptions {
  /** Campo del DTO para `details[].field`. Por defecto `currencyCode`. */
  readonly field?: string;
  readonly tx?: TransactionContext;
}

export interface BaseCurrencyConversionInput {
  /** Monto ≥ 0 con hasta 4 decimales (lo valida el DTO). */
  readonly amount: DecimalString;
  readonly currencyCode: string;
  /** Fecha de referencia de la tasa: `opportunities.opportunity_date` (DM-35). */
  readonly referenceDate: CalendarDate;
  /** País del registro (el del proyecto): define la moneda local admitida (RN-03.78). */
  readonly countryId: string;
  /** Campo del DTO de la moneda, para `details[].field`. Por defecto `currencyCode`. */
  readonly currencyField?: string;
  readonly tx?: TransactionContext;
}

/** Los cinco campos de la estimación (foto, RN-03.79/80) + avisos no bloqueantes (RN-03.81). */
export interface BaseCurrencyConversion {
  /** Monto original, 4 decimales. */
  readonly amount: DecimalString;
  readonly currencyCode: string;
  /** Tasa aplicada (unidades por 1 USD), 8 decimales; `'1.00000000'` en USD. */
  readonly exchangeRate: DecimalString;
  /** Vigencia de la tasa aplicada; `null` en USD. */
  readonly exchangeRateDate: CalendarDate | null;
  /** `round(amount / exchangeRate, 4, HALF_UP)`. */
  readonly amountInBaseCurrency: DecimalString;
  readonly baseCurrencyCode: string;
  /** `EXCHANGE_RATE_STALE` si la tasa es antigua; vacío en otro caso. */
  readonly warnings: readonly ApplicationWarning[];
}

function toOption(currency: CurrencyRecord): CurrencyOption {
  return { code: currency.code, name: currency.name, symbol: currency.symbol, decimals: currency.decimals };
}

/**
 * Moneda base, monedas admitidas y conversión a USD (ADR-024, 00 §2.16, 03 C.11).
 * Transversal y de solo lectura: lo usan Proyectos (estimación de la oportunidad)
 * y Reportes (moneda local de referencia, 05 RN-05.58). No conoce Prisma.
 *
 * - Lee `crm.moneda_base` y `crm.tipos_cambio.dias_aviso_antiguedad` con
 *   `ParameterReader` en cada llamada (sin caché: un cambio rige en la siguiente).
 * - Las lecturas aceptan la transacción del llamador, aunque lo recomendado
 *   (AGENTS.md §9.4) es resolver la tasa **antes** de abrir la transacción de escritura.
 */
@Injectable()
export class CurrencyConversionService {
  constructor(
    @Inject(EXCHANGE_RATE_READER) private readonly reader: ExchangeRateReader,
    private readonly parameters: ParameterReader,
  ) {}

  baseCurrencyCode(): Promise<string> {
    return this.parameters.get<string>(BASE_CURRENCY_PARAMETER);
  }

  /** Monedas admitidas para un registro del país `countryId` (RN-03.78). País inexistente → solo la base. */
  async allowedCurrencies(countryId: string, tx?: TransactionContext): Promise<AllowedCurrencies> {
    return this.allowedFor(await this.baseCurrencyCode(), countryId, tx);
  }

  private async allowedFor(baseCurrencyCode: string, countryId: string, tx?: TransactionContext): Promise<AllowedCurrencies> {
    const countryCurrencyCode = await this.reader.findCountryCurrencyCode(countryId, tx);
    const codes = allowedCurrencyCodes(baseCurrencyCode, countryCurrencyCode);
    const active = new Map(
      (await this.reader.findCurrencies(codes, tx)).filter((currency) => currency.isActive).map((currency) => [currency.code, currency]),
    );
    const allowed = codes.flatMap((code) => {
      const currency = active.get(code);
      return currency ? [toOption(currency)] : [];
    });
    const defaultCurrencyCode =
      countryCurrencyCode && active.has(countryCurrencyCode) ? countryCurrencyCode : baseCurrencyCode;
    return { baseCurrencyCode, defaultCurrencyCode, allowed };
  }

  /** `422 CURRENCY_NOT_ALLOWED` si la moneda no está entre las admitidas del país. */
  async assertCurrencyAllowed(currencyCode: string, countryId: string, options: CurrencyCheckOptions = {}): Promise<CurrencyOption> {
    return this.assertAllowedFor(await this.baseCurrencyCode(), currencyCode, countryId, options);
  }

  private async assertAllowedFor(
    baseCurrencyCode: string,
    currencyCode: string,
    countryId: string,
    options: CurrencyCheckOptions,
  ): Promise<CurrencyOption> {
    const { allowed } = await this.allowedFor(baseCurrencyCode, countryId, options.tx);
    const match = allowed.find((currency) => currency.code === currencyCode);
    if (!match) {
      throw currencyNotAllowedError(
        options.field ?? 'currencyCode',
        currencyCode,
        allowed.map((currency) => currency.code),
      );
    }
    return match;
  }

  /**
   * Tasa aplicable a `date` (00 §2.16): la base → tasa 1 sin fila; otra moneda → la
   * fila con mayor vigencia ≤ `date`; `null` si no hay. No lanza: para Reportes, que
   * omiten la referencia local con motivo `EXCHANGE_RATE_NOT_FOUND` (05 RN-05.58).
   */
  async findApplicable(currencyCode: string, date: CalendarDate, tx?: TransactionContext): Promise<AppliedExchangeRate | null> {
    return this.applicableFor(await this.baseCurrencyCode(), currencyCode, date, tx);
  }

  private async applicableFor(
    baseCurrencyCode: string,
    currencyCode: string,
    date: CalendarDate,
    tx?: TransactionContext,
  ): Promise<AppliedExchangeRate | null> {
    if (!isCalendarDate(date)) {
      throw new RangeError('Invalid reference date (expected YYYY-MM-DD)');
    }
    if (currencyCode === baseCurrencyCode) {
      return baseCurrencyRate(baseCurrencyCode);
    }
    const record = await this.reader.findApplicable(currencyCode, date, tx);
    return record ? fromExchangeRateRecord(record) : null;
  }

  /**
   * Monedas admitidas + tasa + conversión + aviso de antigüedad, en este orden
   * (RN-03.78–RN-03.81). Lanza `422 CURRENCY_NOT_ALLOWED` o
   * `422 EXCHANGE_RATE_NOT_FOUND` (`details[0]: { field, code, currencyCode, date }`)
   * sin efectos: el llamador no ha escrito nada todavía.
   */
  async convertToBase(input: BaseCurrencyConversionInput): Promise<BaseCurrencyConversion> {
    const field = input.currencyField ?? 'currencyCode';
    const baseCurrencyCode = await this.baseCurrencyCode();
    await this.assertAllowedFor(baseCurrencyCode, input.currencyCode, input.countryId, { field, tx: input.tx });

    const rate = await this.applicableFor(baseCurrencyCode, input.currencyCode, input.referenceDate, input.tx);
    if (!rate) {
      throw exchangeRateNotFoundError(field, input.currencyCode, input.referenceDate);
    }

    const warnings: ApplicationWarning[] = [];
    if (!rate.isBaseCurrency) {
      const thresholdDays = await this.parameters.get<number>(STALE_RATE_DAYS_PARAMETER);
      const warning = staleExchangeRateWarning(rate, input.referenceDate, thresholdDays);
      if (warning) warnings.push(warning);
    }

    const amount = roundDecimal(input.amount, AMOUNT_SCALE);
    return {
      amount,
      currencyCode: input.currencyCode,
      exchangeRate: rate.ratePerUsd,
      exchangeRateDate: rate.effectiveDate,
      amountInBaseCurrency: amountInBaseCurrency(amount, rate),
      baseCurrencyCode,
      warnings,
    };
  }
}
