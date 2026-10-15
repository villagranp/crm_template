import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { fromCalendarDate, toCalendarDate } from '@/common/calendar-date';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { CurrencyRecord } from '@/modules/exchange-rates/ports/exchange-rate.reader.port';
import type {
  CreateExchangeRateInput,
  CreateExchangeRateResult,
  ExchangeRateDetailRecord,
  ExchangeRateRepository,
  ExchangeRateSearch,
  ExchangeRateSortField,
  UpdateExchangeRateInput,
} from '@/modules/exchange-rates/ports/exchange-rate.repository.port';

import { PrismaService } from '../prisma.service';

const UNIQUE_VIOLATION = 'P2002';
const RATE_DECIMALS = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATE_SELECT = {
  id: true,
  currencyCode: true,
  effectiveDate: true,
  ratePerUsd: true,
  source: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.ExchangeRateSelect;

const CURRENCY_SELECT = { code: true, name: true, symbol: true, decimals: true, isActive: true } satisfies Prisma.CurrencySelect;

type RateRow = Prisma.ExchangeRateGetPayload<{ select: typeof RATE_SELECT }>;

const SORT_COLUMNS: Record<ExchangeRateSortField, keyof Prisma.ExchangeRateOrderByWithRelationInput> = {
  effectiveDate: 'effectiveDate',
  currencyCode: 'currencyCode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

/**
 * Adaptador de `ExchangeRateRepository` (07 F.7, RN-07.44). El único
 * `uq_exchange_rates_currency_effective_date` es la última barrera contra el
 * duplicado concurrente: su violación (`P2002`) se traduce a `DUPLICATE`. Las
 * fechas `@db.Date` viajan como medianoche UTC; las tasas, con `toFixed(8)`.
 * `exchange_rates.updated_by_id` no tiene relación Prisma: el nombre se resuelve
 * con una consulta aparte a `users`.
 */
@Injectable()
export class PrismaExchangeRatesRepository implements ExchangeRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(search: ExchangeRateSearch): Promise<Page<ExchangeRateDetailRecord>> {
    const effectiveDate: Prisma.DateTimeFilter = {};
    if (search.from) effectiveDate.gte = fromCalendarDate(search.from);
    if (search.to) effectiveDate.lte = fromCalendarDate(search.to);
    const where: Prisma.ExchangeRateWhereInput = {
      ...(search.currencyCode ? { currencyCode: search.currencyCode } : {}),
      ...(search.from || search.to ? { effectiveDate } : {}),
    };
    const primary = SORT_COLUMNS[search.sortBy];
    const orderBy: Prisma.ExchangeRateOrderByWithRelationInput[] = [{ [primary]: search.sortOrder }];
    if (primary !== 'effectiveDate') orderBy.push({ effectiveDate: 'desc' });
    if (primary !== 'currencyCode') orderBy.push({ currencyCode: 'asc' });
    orderBy.push({ id: 'asc' });

    const [rows, total] = await Promise.all([
      this.prisma.exchangeRate.findMany({
        where,
        select: RATE_SELECT,
        orderBy,
        skip: (search.page - 1) * search.pageSize,
        take: search.pageSize,
      }),
      this.prisma.exchangeRate.count({ where }),
    ]);
    return createPage(await this.withAuthors(rows), total, search);
  }

  async findById(id: string): Promise<ExchangeRateDetailRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    const row = await this.prisma.exchangeRate.findUnique({ where: { id }, select: RATE_SELECT });
    return row ? ((await this.withAuthors([row]))[0] ?? null) : null;
  }

  listCurrencies(): Promise<CurrencyRecord[]> {
    return this.prisma.currency.findMany({ select: CURRENCY_SELECT, orderBy: { code: 'asc' } });
  }

  findCurrency(code: string): Promise<CurrencyRecord | null> {
    return this.prisma.currency.findUnique({ where: { code }, select: CURRENCY_SELECT });
  }

  async create(input: CreateExchangeRateInput, actorId: string | null): Promise<CreateExchangeRateResult> {
    try {
      const row = await this.prisma.exchangeRate.create({
        data: {
          currencyCode: input.currencyCode,
          effectiveDate: fromCalendarDate(input.effectiveDate),
          ratePerUsd: input.ratePerUsd,
          source: input.source,
          notes: input.notes,
          createdById: actorId,
          updatedById: actorId,
        },
        select: RATE_SELECT,
      });
      return { ok: true, record: (await this.withAuthors([row]))[0]! };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        return { ok: false, reason: 'DUPLICATE' };
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateExchangeRateInput, actorId: string | null): Promise<ExchangeRateDetailRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    const data: Prisma.ExchangeRateUncheckedUpdateInput = { updatedById: actorId };
    if (input.ratePerUsd !== undefined) data.ratePerUsd = input.ratePerUsd;
    if (input.source !== undefined) data.source = input.source;
    if (input.notes !== undefined) data.notes = input.notes;
    const result = await this.prisma.exchangeRate.updateMany({ where: { id }, data });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  private async withAuthors(rows: readonly RateRow[]): Promise<ExchangeRateDetailRecord[]> {
    const ids = [...new Set(rows.map((row) => row.updatedById).filter((id): id is string => id !== null))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      id: row.id,
      currencyCode: row.currencyCode,
      effectiveDate: toCalendarDate(row.effectiveDate),
      ratePerUsd: row.ratePerUsd.toFixed(RATE_DECIMALS),
      source: row.source,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedById && names.has(row.updatedById) ? { id: row.updatedById, displayName: names.get(row.updatedById)! } : null,
    }));
  }
}
