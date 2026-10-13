import { Injectable } from '@nestjs/common';

import { type CalendarDate, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type {
  CurrencyRecord,
  ExchangeRateReader,
  ExchangeRateRecord,
} from '@/modules/exchange-rates/ports/exchange-rate.reader.port';

import { PrismaService } from '../prisma.service';
import { prismaClientFor } from '../prisma-transaction';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_DECIMALS = 8;

/**
 * Adaptador de `ExchangeRateReader` (ADR-024, 00 §2.16). La búsqueda "mayor vigencia
 * ≤ fecha" usa el único `(currency_code, effective_date)` (orden descendente, una
 * fila). Las fechas `@db.Date` se pasan y leen como medianoche UTC.
 */
@Injectable()
export class PrismaExchangeRateReaderRepository implements ExchangeRateReader {
  constructor(private readonly prisma: PrismaService) {}

  async findApplicable(currencyCode: string, date: CalendarDate, tx?: TransactionContext): Promise<ExchangeRateRecord | null> {
    const row = await prismaClientFor(this.prisma, tx).exchangeRate.findFirst({
      where: { currencyCode, effectiveDate: { lte: fromCalendarDate(date) } },
      orderBy: { effectiveDate: 'desc' },
      select: { currencyCode: true, effectiveDate: true, ratePerUsd: true, source: true },
    });
    return row
      ? {
          currencyCode: row.currencyCode,
          effectiveDate: toCalendarDate(row.effectiveDate),
          ratePerUsd: row.ratePerUsd.toFixed(RATE_DECIMALS),
          source: row.source,
        }
      : null;
  }

  async findCurrencies(codes: readonly string[], tx?: TransactionContext): Promise<CurrencyRecord[]> {
    if (codes.length === 0) return [];
    return prismaClientFor(this.prisma, tx).currency.findMany({
      where: { code: { in: [...codes] } },
      select: { code: true, name: true, symbol: true, decimals: true, isActive: true },
    });
  }

  async findCountryCurrencyCode(countryId: string, tx?: TransactionContext): Promise<string | null> {
    // Un id que no es UUID no puede existir (y la columna `uuid` lanzaría un error de tipo).
    if (!UUID_PATTERN.test(countryId)) return null;
    const row = await prismaClientFor(this.prisma, tx).country.findUnique({ where: { id: countryId }, select: { currencyCode: true } });
    return row?.currencyCode ?? null;
  }
}
