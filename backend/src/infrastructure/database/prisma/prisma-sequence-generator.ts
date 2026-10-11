import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  calendarPartsAt,
  formatSequenceCode,
  isSequenceResetPolicy,
  nextCounterValue,
  periodKeyFor,
} from '@/infrastructure/database/ports/sequence-format';
import {
  type SequenceGenerator,
  type SequenceNextOptions,
  SequenceNotFoundError,
} from '@/infrastructure/database/ports/sequence-generator.port';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import { PrismaService } from './prisma.service';
import { prismaClientFor } from './prisma-transaction';

interface LockedSequenceRow {
  id: string;
  prefix: string;
  pattern: string;
  padding: number;
  current_value: number;
  reset_policy: string;
  period_key: string | null;
}

const DEFAULT_TIME_ZONE = 'UTC';

/**
 * Adaptador de `SequenceGenerator` (00 §6.1). `SELECT … FOR UPDATE` sobre la fila
 * de `sequences`: la segunda transacción que pide un folio de la misma clave
 * espera a que la primera confirme o se deshaga y lee su valor ya incrementado.
 *
 * SQL parametrizado (`$queryRaw` con plantilla): la clave nunca se concatena.
 */
@Injectable()
export class PrismaSequenceGenerator implements SequenceGenerator {
  constructor(private readonly prisma: PrismaService) {}

  next(key: string, tx?: TransactionContext, options: SequenceNextOptions = {}): Promise<string> {
    if (tx) {
      return this.nextWithin(prismaClientFor(this.prisma, tx), key, options);
    }
    return this.prisma.$transaction((ownTx) => this.nextWithin(ownTx, key, options));
  }

  private async nextWithin(db: Prisma.TransactionClient, key: string, options: SequenceNextOptions): Promise<string> {
    const rows = await db.$queryRaw<LockedSequenceRow[]>`
      SELECT id, prefix, pattern, padding, current_value, reset_policy, period_key
      FROM sequences
      WHERE key = ${key}
      FOR UPDATE`;
    const row = rows[0];
    if (!row) {
      throw new SequenceNotFoundError(key);
    }
    if (!isSequenceResetPolicy(row.reset_policy)) {
      throw new Error(`Sequence ${key} has an unknown reset policy`);
    }

    const parts = calendarPartsAt(options.at ?? new Date(), options.timeZone ?? DEFAULT_TIME_ZONE);
    const periodKey = periodKeyFor(row.reset_policy, parts);
    const value = nextCounterValue(row.current_value, row.period_key, periodKey);

    await db.$executeRaw`
      UPDATE sequences
      SET current_value = ${value}, period_key = ${periodKey}, updated_at = now()
      WHERE id = ${row.id}::uuid`;

    return formatSequenceCode(
      { prefix: row.prefix, pattern: row.pattern, padding: row.padding, resetPolicy: row.reset_policy },
      value,
      parts,
    );
  }
}
