import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import { CurrencyConversionService } from './currency-conversion.service';
import {
  currencyIssue,
  exchangeRateDuplicateError,
  invalidExchangeRateError,
  isPositiveRate,
  normalizeRate,
} from './exchange-rate-maintenance-rules';
import type { CurrencyRecord } from './ports/exchange-rate.reader.port';
import {
  EXCHANGE_RATE_REPOSITORY,
  type ExchangeRateDetailRecord,
  type ExchangeRateRepository,
  type ExchangeRateSortField,
  type UpdateExchangeRateInput,
} from './ports/exchange-rate.repository.port';

export const EXCHANGE_RATE_RESOURCE_TYPE = 'crm.exchange_rate';
export const EXCHANGE_RATE_EVENTS = {
  created: 'crm.exchange_rate.created',
  updated: 'crm.exchange_rate.updated',
} as const;

export interface SearchExchangeRatesRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly currencyCode?: string;
  readonly from?: CalendarDate;
  readonly to?: CalendarDate;
  readonly sortBy?: ExchangeRateSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface CreateExchangeRateRequest {
  readonly currencyCode: string;
  readonly effectiveDate: CalendarDate;
  readonly ratePerUsd: DecimalString;
  readonly source: string;
  readonly notes?: string | null;
}

export interface UpdateExchangeRateRequest {
  readonly ratePerUsd?: DecimalString;
  readonly source?: string;
  readonly notes?: string | null;
}

/** Quién escribe: el usuario local (para `created_by_id`/`updated_by_id`) y el contexto de auditoría. */
export interface MaintenanceActor {
  readonly userId: string | null;
  readonly audit: AuditContext;
}

function auditedState(record: ExchangeRateDetailRecord): Record<string, unknown> {
  return {
    currencyCode: record.currencyCode,
    effectiveDate: record.effectiveDate,
    ratePerUsd: record.ratePerUsd,
    source: record.source,
    notes: record.notes,
  };
}

/**
 * Mantenimiento de tipos de cambio y consulta de monedas (07 F.7, RN-07.44; ADR-024).
 *
 * - Una tasa por (moneda, fecha de vigencia): `409 EXCHANGE_RATE_DUPLICATE`.
 * - Moneda existente, activa y distinta de la base; tasa > 0: si no, `422 INVALID_EXCHANGE_RATE`.
 * - `currencyCode` y `effectiveDate` son inmutables (el DTO de corrección no los
 *   declara: enviarlos es `400`). Sin borrado ni desactivación.
 * - Corregir o añadir una tasa **no** recalcula las oportunidades: guardan la foto
 *   (`exchangeRate`, `exchangeRateDate`, `estimatedAmountUsd`) y no una referencia (00 §2.16).
 * - Auditoría `crm.exchange_rate.created` / `crm.exchange_rate.updated` con antes/después.
 */
@Injectable()
export class ExchangeRatesService {
  constructor(
    @Inject(EXCHANGE_RATE_REPOSITORY) private readonly repository: ExchangeRateRepository,
    private readonly currencies: CurrencyConversionService,
    private readonly audit: AuditService,
  ) {}

  search(request: SearchExchangeRatesRequest): Promise<Page<ExchangeRateDetailRecord>> {
    return this.repository.search({
      page: request.page,
      pageSize: request.pageSize,
      currencyCode: request.currencyCode ?? null,
      from: request.from ?? null,
      to: request.to ?? null,
      sortBy: request.sortBy ?? 'effectiveDate',
      sortOrder: request.sortOrder ?? 'desc',
    });
  }

  listCurrencies(): Promise<CurrencyRecord[]> {
    return this.repository.listCurrencies();
  }

  async create(request: CreateExchangeRateRequest, actor: MaintenanceActor): Promise<ExchangeRateDetailRecord> {
    const baseCurrencyCode = await this.currencies.baseCurrencyCode();
    const issue = currencyIssue(request.currencyCode, await this.repository.findCurrency(request.currencyCode), baseCurrencyCode);
    if (issue) {
      throw invalidExchangeRateError(issue, request.currencyCode);
    }
    if (!isPositiveRate(request.ratePerUsd)) {
      throw invalidExchangeRateError('non_positive_rate');
    }

    const result = await this.repository.create(
      {
        currencyCode: request.currencyCode,
        effectiveDate: request.effectiveDate,
        ratePerUsd: normalizeRate(request.ratePerUsd),
        source: request.source,
        notes: request.notes ?? null,
      },
      actor.userId,
    );
    if (!result.ok) {
      throw exchangeRateDuplicateError(request.currencyCode, request.effectiveDate);
    }

    await this.audit.record(EXCHANGE_RATE_EVENTS.created, actor.audit, {
      resourceType: EXCHANGE_RATE_RESOURCE_TYPE,
      resourceId: result.record.id,
      before: null,
      after: auditedState(result.record),
    });
    return result.record;
  }

  async update(id: string, request: UpdateExchangeRateRequest, actor: MaintenanceActor): Promise<ExchangeRateDetailRecord> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new ResourceNotFoundError('ExchangeRate', id);
    }
    if (request.ratePerUsd !== undefined && !isPositiveRate(request.ratePerUsd)) {
      throw invalidExchangeRateError('non_positive_rate');
    }

    const changes: UpdateExchangeRateInput = {
      ...(request.ratePerUsd !== undefined ? { ratePerUsd: normalizeRate(request.ratePerUsd) } : {}),
      ...(request.source !== undefined ? { source: request.source } : {}),
      ...(request.notes !== undefined ? { notes: request.notes } : {}),
    };
    const unchanged =
      (changes.ratePerUsd === undefined || changes.ratePerUsd === current.ratePerUsd) &&
      (changes.source === undefined || changes.source === current.source) &&
      (changes.notes === undefined || changes.notes === current.notes);
    if (unchanged) {
      return current;
    }

    const updated = await this.repository.update(id, changes, actor.userId);
    if (!updated) {
      throw new ResourceNotFoundError('ExchangeRate', id);
    }
    await this.audit.record(EXCHANGE_RATE_EVENTS.updated, actor.audit, {
      resourceType: EXCHANGE_RATE_RESOURCE_TYPE,
      resourceId: id,
      before: auditedState(current),
      after: auditedState(updated),
      metadata: { currencyCode: updated.currencyCode, effectiveDate: updated.effectiveDate },
    });
    return updated;
  }
}
