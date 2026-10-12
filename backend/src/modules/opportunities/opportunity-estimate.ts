import type { CalendarDate } from '@/common/calendar-date';
import { compareDecimal, type DecimalString, roundDecimal } from '@/common/decimal';
import type { BaseCurrencyConversion } from '@/modules/exchange-rates/currency-conversion.service';

import { AMOUNT_DECIMALS } from './opportunity-constants';
import { OPPORTUNITY_ERROR_CODES, type OpportunityIssue, opportunityIssue } from './opportunity-errors';

/**
 * Estimación de la oportunidad en USD o en la moneda del país del proyecto (03 C.11,
 * RN-03.78–RN-03.83, DM-1, DM-36, ADR-024). Pura: decide **si** hay que resolver la
 * tasa y cómo queda la foto. Las monedas admitidas, la tasa aplicable, la conversión
 * `round(monto / tasa, 4, HALF_UP)` y el aviso `EXCHANGE_RATE_STALE` los aplica
 * `CurrencyConversionService.convertToBase` (transversal, E1), al que esta función
 * entrega el plan.
 *
 * - El cliente envía solo `estimatedAmount` y `currencyCode`; los otros tres campos los
 *   resuelve el servidor (RN-03.82: nunca llegan del cliente).
 * - Los cinco campos van juntos o ninguno (`ck_opportunities_amount_set`): monto sin
 *   moneda → `422 CURRENCY_REQUIRED` (el servidor no aplica moneda por defecto,
 *   AC-03.43); moneda sin monto → `422 REQUIRED_FIELD_MISSING` (`estimatedAmount`).
 * - **Foto** (RN-03.82): solo se vuelve a resolver si cambia el monto (valor decimal),
 *   la moneda o la fecha de la oportunidad (`opportunityDate`, referencia de la tasa).
 */

export interface EstimateSnapshot {
  readonly estimatedAmount: DecimalString | null;
  readonly currencyCode: string | null;
  readonly exchangeRate: DecimalString | null;
  readonly exchangeRateDate: CalendarDate | null;
  readonly estimatedAmountUsd: DecimalString | null;
}

/** Lo que pide el cliente: `undefined` = sin cambio (PATCH); `null` = borrar. */
export interface EstimateRequest {
  readonly estimatedAmount?: string | null;
  readonly currencyCode?: string | null;
}

export type EstimatePlan =
  | { readonly kind: 'KEEP' }
  | { readonly kind: 'CLEAR' }
  | { readonly kind: 'CONVERT'; readonly amount: DecimalString; readonly currencyCode: string; readonly referenceDate: CalendarDate };

export const EMPTY_ESTIMATE: EstimateSnapshot = {
  estimatedAmount: null,
  currencyCode: null,
  exchangeRate: null,
  exchangeRateDate: null,
  estimatedAmountUsd: null,
};

export function normalizeCurrencyCode(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value.trim().toUpperCase();
}

/**
 * Plan de la estimación. `current = null` en un alta. `dates.before` es la fecha de
 * la oportunidad guardada (nula en un alta) y `dates.after` la que quedará.
 * Lanza nada: devuelve las incidencias (`422`) para que el caso de uso las reúna.
 */
export function planEstimate(
  current: EstimateSnapshot | null,
  request: EstimateRequest,
  dates: { readonly before: CalendarDate | null; readonly after: CalendarDate },
): { readonly plan: EstimatePlan; readonly issues: readonly OpportunityIssue[] } {
  const base = current ?? EMPTY_ESTIMATE;
  const amount = request.estimatedAmount === undefined ? base.estimatedAmount : request.estimatedAmount;
  const requestedCurrency = normalizeCurrencyCode(request.currencyCode);
  const currencyCode = requestedCurrency === undefined ? base.currencyCode : requestedCurrency;

  if (amount !== null && currencyCode === null) {
    return { plan: { kind: 'KEEP' }, issues: [opportunityIssue('currencyCode', OPPORTUNITY_ERROR_CODES.currencyRequired)] };
  }
  if (amount === null && currencyCode !== null) {
    return { plan: { kind: 'KEEP' }, issues: [opportunityIssue('estimatedAmount', OPPORTUNITY_ERROR_CODES.requiredFieldMissing)] };
  }
  if (amount === null || currencyCode === null) {
    return { plan: base.estimatedAmount === null ? { kind: 'KEEP' } : { kind: 'CLEAR' }, issues: [] };
  }

  const changed =
    current === null ||
    base.estimatedAmount === null ||
    compareDecimal(amount, base.estimatedAmount) !== 0 ||
    currencyCode !== base.currencyCode ||
    dates.before !== dates.after;
  return {
    plan: changed ? { kind: 'CONVERT', amount: roundDecimal(amount, AMOUNT_DECIMALS), currencyCode, referenceDate: dates.after } : { kind: 'KEEP' },
    issues: [],
  };
}

/** Los cinco campos (foto) a partir de la conversión del servicio transversal. */
export function snapshotFromConversion(conversion: BaseCurrencyConversion): EstimateSnapshot {
  return {
    estimatedAmount: conversion.amount,
    currencyCode: conversion.currencyCode,
    exchangeRate: conversion.exchangeRate,
    exchangeRateDate: conversion.exchangeRateDate,
    estimatedAmountUsd: conversion.amountInBaseCurrency,
  };
}

/** Foto resultante de un plan (`KEEP` conserva la actual). */
export function applyEstimatePlan(current: EstimateSnapshot, plan: EstimatePlan, conversion: BaseCurrencyConversion | null): EstimateSnapshot {
  if (plan.kind === 'CLEAR') return EMPTY_ESTIMATE;
  if (plan.kind === 'CONVERT') {
    if (!conversion) throw new Error('A CONVERT estimate plan needs its conversion');
    return snapshotFromConversion(conversion);
  }
  return current;
}
