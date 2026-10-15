import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { type CalendarDate, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type {
  CreateSafetyMinuteInput,
  CreateSafetyMinuteResult,
  SafetyMinuteRecord,
  SafetyMinuteRepository,
  SafetyMinuteSearch,
  SafetyMinuteSortField,
  UpdateSafetyMinuteInput,
  UpdateSafetyMinuteResult,
} from '@/modules/safety-minutes/ports/safety-minute.repository.port';

import { PrismaService } from '../prisma.service';

const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MINUTE_SELECT = {
  id: true,
  message: true,
  displayDate: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.SafetyMinuteSelect;

type MinuteRow = Prisma.SafetyMinuteGetPayload<{ select: typeof MINUTE_SELECT }>;

const SORT_COLUMNS: Record<SafetyMinuteSortField, keyof Prisma.SafetyMinuteOrderByWithRelationInput> = {
  displayDate: 'displayDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Adaptador de `SafetyMinuteRepository` (Ajustes 1, AJ1-2). El único `uq_safety_minutes_display_date`
 * es la última barrera contra el duplicado concurrente: su violación (`P2002`) se traduce a
 * `DUPLICATE`. Las fechas `@db.Date` viajan como medianoche UTC. `safety_minutes.updated_by_id`
 * no tiene relación Prisma (como `exchange_rates`): el nombre se resuelve con una consulta
 * aparte a `users`.
 */
@Injectable()
export class PrismaSafetyMinutesRepository implements SafetyMinuteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(search: SafetyMinuteSearch): Promise<Page<SafetyMinuteRecord>> {
    const displayDate: Prisma.DateTimeFilter = {};
    if (search.from) displayDate.gte = fromCalendarDate(search.from);
    if (search.to) displayDate.lte = fromCalendarDate(search.to);
    const where: Prisma.SafetyMinuteWhereInput = search.from || search.to ? { displayDate } : {};
    const primary = SORT_COLUMNS[search.sortBy];
    const orderBy: Prisma.SafetyMinuteOrderByWithRelationInput[] = [{ [primary]: search.sortOrder }];
    if (primary !== 'displayDate') orderBy.push({ displayDate: 'desc' });
    orderBy.push({ id: 'asc' });

    const [rows, total] = await Promise.all([
      this.prisma.safetyMinute.findMany({
        where,
        select: MINUTE_SELECT,
        orderBy,
        skip: (search.page - 1) * search.pageSize,
        take: search.pageSize,
      }),
      this.prisma.safetyMinute.count({ where }),
    ]);
    return createPage(await this.withAuthors(rows), total, search);
  }

  async findById(id: string): Promise<SafetyMinuteRecord | null> {
    if (!UUID_PATTERN.test(id)) return null;
    const row = await this.prisma.safetyMinute.findUnique({ where: { id }, select: MINUTE_SELECT });
    return row ? ((await this.withAuthors([row]))[0] ?? null) : null;
  }

  async findByDisplayDate(displayDate: CalendarDate): Promise<SafetyMinuteRecord | null> {
    const row = await this.prisma.safetyMinute.findUnique({ where: { displayDate: fromCalendarDate(displayDate) }, select: MINUTE_SELECT });
    return row ? ((await this.withAuthors([row]))[0] ?? null) : null;
  }

  async create(input: CreateSafetyMinuteInput, actorId: string | null): Promise<CreateSafetyMinuteResult> {
    try {
      const row = await this.prisma.safetyMinute.create({
        data: { message: input.message, displayDate: fromCalendarDate(input.displayDate), createdById: actorId, updatedById: actorId },
        select: MINUTE_SELECT,
      });
      return { ok: true, record: (await this.withAuthors([row]))[0]! };
    } catch (error) {
      if (isPrismaError(error, UNIQUE_VIOLATION)) {
        return { ok: false, reason: 'DUPLICATE' };
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateSafetyMinuteInput, actorId: string | null): Promise<UpdateSafetyMinuteResult> {
    if (!UUID_PATTERN.test(id)) return { ok: false, reason: 'NOT_FOUND' };
    const data: Prisma.SafetyMinuteUncheckedUpdateInput = { updatedById: actorId };
    if (input.message !== undefined) data.message = input.message;
    if (input.displayDate !== undefined) data.displayDate = fromCalendarDate(input.displayDate);
    try {
      const row = await this.prisma.safetyMinute.update({ where: { id }, data, select: MINUTE_SELECT });
      return { ok: true, record: (await this.withAuthors([row]))[0]! };
    } catch (error) {
      if (isPrismaError(error, UNIQUE_VIOLATION)) return { ok: false, reason: 'DUPLICATE' };
      if (isPrismaError(error, RECORD_NOT_FOUND)) return { ok: false, reason: 'NOT_FOUND' };
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!UUID_PATTERN.test(id)) return false;
    const result = await this.prisma.safetyMinute.deleteMany({ where: { id } });
    return result.count > 0;
  }

  private async withAuthors(rows: readonly MinuteRow[]): Promise<SafetyMinuteRecord[]> {
    const ids = [...new Set(rows.map((row) => row.updatedById).filter((id): id is string => id !== null))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      displayDate: toCalendarDate(row.displayDate),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedById && names.has(row.updatedById) ? { id: row.updatedById, displayName: names.get(row.updatedById)! } : null,
    }));
  }
}
