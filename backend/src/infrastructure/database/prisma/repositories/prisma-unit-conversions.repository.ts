import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type {
  ConversionRuleRecord,
  UnitConversionReader,
  UnitRecord,
} from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

import { PrismaService } from '../prisma.service';
import { prismaClientFor } from '../prisma-transaction';

const FACTOR_DECIMALS = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RULE_SELECT = {
  id: true,
  fromUnitId: true,
  toUnitId: true,
  factor: true,
  scope: true,
  scopeKey: true,
  isActive: true,
} satisfies Prisma.UnitConversionRuleSelect;

type RuleRow = Prisma.UnitConversionRuleGetPayload<{ select: typeof RULE_SELECT }>;

function toRule(row: RuleRow): ConversionRuleRecord {
  return {
    id: row.id,
    fromUnitId: row.fromUnitId,
    toUnitId: row.toUnitId,
    factor: row.factor.toFixed(FACTOR_DECIMALS),
    scope: row.scope,
    scopeKey: row.scopeKey,
    isActive: row.isActive,
  };
}

/**
 * Adaptador de `UnitConversionReader` (00 §2.3). `findRules` filtra por
 * `(from_unit_id, to_unit_id, scope_key IN …)`, cubierto por el único
 * `uq_unit_conversion_rules_from_to_scope`: como mucho una fila por ámbito.
 */
@Injectable()
export class PrismaUnitConversionsRepository implements UnitConversionReader {
  constructor(private readonly prisma: PrismaService) {}

  async findUnitByCode(code: string, tx?: TransactionContext): Promise<UnitRecord | null> {
    return prismaClientFor(this.prisma, tx).unitOfMeasure.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, symbol: true, dimension: true, isActive: true },
    });
  }

  async findProductFamilyId(productId: string, tx?: TransactionContext): Promise<string | null> {
    if (!UUID_PATTERN.test(productId)) return null;
    const row = await prismaClientFor(this.prisma, tx).product.findUnique({ where: { id: productId }, select: { familyId: true } });
    return row?.familyId ?? null;
  }

  async findRules(
    fromUnitId: string,
    toUnitId: string,
    scopeKeys: readonly string[],
    tx?: TransactionContext,
  ): Promise<ConversionRuleRecord[]> {
    if (scopeKeys.length === 0 || !UUID_PATTERN.test(fromUnitId) || !UUID_PATTERN.test(toUnitId)) return [];
    const rows = await prismaClientFor(this.prisma, tx).unitConversionRule.findMany({
      where: { fromUnitId, toUnitId, scopeKey: { in: [...scopeKeys] } },
      select: RULE_SELECT,
    });
    return rows.map(toRule);
  }

  async findRuleById(ruleId: string, tx?: TransactionContext): Promise<ConversionRuleRecord | null> {
    if (!UUID_PATTERN.test(ruleId)) return null;
    const row = await prismaClientFor(this.prisma, tx).unitConversionRule.findUnique({ where: { id: ruleId }, select: RULE_SELECT });
    return row ? toRule(row) : null;
  }
}
