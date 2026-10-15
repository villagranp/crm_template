import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/**
 * Clientes de tipos de cambio y monedas (07 F.7, RN-07.44, ADR-024). Sin
 * `DELETE` ni `isActive`: una tasa se corrige o se registra otra fecha.
 * `ratePerUsd` viaja como cadena decimal (`Decimal(19,8)`, nunca `number`) y
 * `effectiveDate` como fecha sin hora (`YYYY-MM-DD`).
 */

/** `ExchangeRateResponseDto`. */
export interface ExchangeRate {
  id: string;
  /** ISO 4217. */
  currencyCode: string;
  /** `YYYY-MM-DD`. */
  effectiveDate: string;
  /** Unidades de la moneda por 1 USD, como cadena decimal. */
  ratePerUsd: string;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: string; displayName: string } | null;
}

/** `GET /currencies`: sembradas, de sólo lectura. */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isActive: boolean;
}

export interface CreateExchangeRateRequest {
  currencyCode: string;
  effectiveDate: string;
  ratePerUsd: string;
  source: string;
  notes?: string;
}

/** `currencyCode` y `effectiveDate` son inmutables: no viajan (un campo no declarado es `400`). */
export interface UpdateExchangeRateRequest {
  ratePerUsd?: string;
  source?: string;
  notes?: string | null;
}

const RATES_PATH = '/exchange-rates';

/**
 * Query: `currencyCode`, `from`, `to` (sobre `effectiveDate`), `page`, `pageSize`,
 * `sortBy` (`effectiveDate` por defecto, `currencyCode`, `createdAt`, `updatedAt`) y
 * `sortOrder` (`desc` por defecto). No admite `search`.
 */
export function listExchangeRates(query: ListQuery): Promise<Paginated<ExchangeRate>> {
  return httpClient.get<Paginated<ExchangeRate>>(RATES_PATH, { query });
}

export function createExchangeRate(body: CreateExchangeRateRequest): Promise<ExchangeRate> {
  return httpClient.post<ExchangeRate>(RATES_PATH, { body });
}

export function updateExchangeRate(
  id: string,
  body: UpdateExchangeRateRequest,
): Promise<ExchangeRate> {
  return httpClient.patch<ExchangeRate>(`${RATES_PATH}/${id}`, { body });
}

/** `GET /currencies` responde `{ data: Currency[] }` (sin paginar). */
export async function listCurrencies(): Promise<Currency[]> {
  const response = await httpClient.get<{ data: Currency[] }>('/currencies');
  return response.data;
}
