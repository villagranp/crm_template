import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type {
  CommercialLinkReader,
  OpportunityLink,
  ProjectLink,
} from '@/modules/commercial-activity/ports/commercial-link.reader.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { visibilityScopeSql } from '../sql-text';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adaptador Prisma de `CommercialLinkReader` (04 RN-04.1, RN-04.2) sobre las tablas
 * `projects` y `opportunities`. El bloqueo del proyecto y `last_activity_at` los
 * hace el repositorio del Módulo 3 (`LinkedProjectsService`).
 */
@Injectable()
export class PrismaCommercialLinkReader implements CommercialLinkReader {
  constructor(private readonly prisma: PrismaService) {}

  async findProject(projectId: string, visibility: VisibilityScope, tx?: TransactionContext): Promise<ProjectLink | null> {
    if (!UUID_PATTERN.test(projectId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const rows = await db.$queryRaw<{ id: string; customer_id: string; is_deleted: boolean; in_scope: boolean }[]>`
      SELECT p.id, p.customer_id, p.deleted_at IS NOT NULL AS is_deleted,
             ${visibilityScopeSql(visibility, Prisma.sql`p.owner_id`, Prisma.sql`p.country_id`)} AS in_scope
      FROM projects p
      WHERE p.id = ${projectId}::uuid`;
    const row = rows[0];
    return row ? { id: row.id, customerId: row.customer_id, isDeleted: row.is_deleted, isVisible: row.in_scope } : null;
  }

  async findOpportunity(
    opportunityId: string,
    visibility: { readonly projects: VisibilityScope; readonly opportunities: VisibilityScope },
    tx?: TransactionContext,
  ): Promise<OpportunityLink | null> {
    if (!UUID_PATTERN.test(opportunityId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const byProject = visibilityScopeSql(visibility.projects, Prisma.sql`p.owner_id`, Prisma.sql`p.country_id`);
    const byOpportunity = visibilityScopeSql(visibility.opportunities, Prisma.sql`o.owner_id`, Prisma.sql`p.country_id`);
    // Con `tx`, `FOR SHARE` sobre la oportunidad: su eliminación (Módulo 3) espera a que
    // la transacción del llamador confirme (00 P3, RN-04.2).
    const lock = tx ? Prisma.sql`FOR SHARE OF o` : Prisma.empty;
    const rows = await db.$queryRaw<{ id: string; project_id: string; is_deleted: boolean; in_scope: boolean }[]>`
      SELECT o.id, o.project_id, o.deleted_at IS NOT NULL AS is_deleted,
             ((${byProject} AND p.deleted_at IS NULL) OR ${byOpportunity}) AS in_scope
      FROM opportunities o
      JOIN projects p ON p.id = o.project_id
      WHERE o.id = ${opportunityId}::uuid
      ${lock}`;
    const row = rows[0];
    return row ? { id: row.id, projectId: row.project_id, isDeleted: row.is_deleted, isVisible: row.in_scope } : null;
  }
}
