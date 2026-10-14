import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type {
  CommercialActivityUsageQuery,
  OpenCommercialActivityCount,
} from '@/modules/commercial-activity/ports/commercial-activity-usage.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NONE: OpenCommercialActivityCount = { visits: 0, activities: 0, total: 0 };

/**
 * Adaptador Prisma de `CommercialActivityUsageQuery` (04 F.6, G.2): conteos para los
 * bloqueos de eliminación de 02 y 03. "Abierta" por semántica de catálogo (RN-04.4):
 * visita pendiente o realizada sin confirmar; actividad abierta no eliminada.
 */
@Injectable()
export class PrismaCommercialActivityUsageQuery implements CommercialActivityUsageQuery {
  constructor(private readonly prisma: PrismaService) {}

  countOpenByCustomer(customerId: string, tx?: TransactionContext): Promise<OpenCommercialActivityCount> {
    return this.countOpen(Prisma.sql`customer_id`, customerId, tx);
  }

  countOpenByProject(projectId: string, tx?: TransactionContext): Promise<OpenCommercialActivityCount> {
    return this.countOpen(Prisma.sql`project_id`, projectId, tx);
  }

  async countByContact(contactId: string, tx?: TransactionContext): Promise<number> {
    if (!UUID_PATTERN.test(contactId)) return 0;
    const rows = await prismaClientFor(this.prisma, tx).$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM interaction_participants ip
      LEFT JOIN activities a ON a.id = ip.activity_id
      WHERE ip.contact_id = ${contactId}::uuid AND (ip.visit_id IS NOT NULL OR a.deleted_at IS NULL)`;
    return rows[0]?.total ?? 0;
  }

  private async countOpen(column: Prisma.Sql, id: string, tx?: TransactionContext): Promise<OpenCommercialActivityCount> {
    if (!UUID_PATTERN.test(id)) return NONE;
    const rows = await prismaClientFor(this.prisma, tx).$queryRaw<{ visits: number; activities: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM visits v JOIN catalog_items s ON s.id = v.status_id
          WHERE v.${column} = ${id}::uuid
            AND ((s.metadata ->> 'isPending') = 'true' OR (s.metadata ->> 'isDone') = 'true')) AS visits,
        (SELECT COUNT(*)::int FROM activities a JOIN catalog_items s ON s.id = a.status_id
          WHERE a.${column} = ${id}::uuid AND a.deleted_at IS NULL AND (s.metadata ->> 'isOpen') = 'true') AS activities`;
    const visits = rows[0]?.visits ?? 0;
    const activities = rows[0]?.activities ?? 0;
    return { visits, activities, total: visits + activities };
  }
}
