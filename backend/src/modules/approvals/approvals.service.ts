import { Inject, Injectable } from '@nestjs/common';

import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';

import {
  APPROVALS_REPOSITORY,
  type ApprovalDetailRecord,
  type ApprovalListFilter,
  type ApprovalPageRequest,
  type ApprovalsRepository,
  type ApprovalSummaryRecord,
} from './ports/approvals.repository.port';

/**
 * Bandeja de aprobaciones, de solo lectura (PLAN-ADMIN, D12).
 *
 * No hay casos de uso para crear ni resolver: hoy ningún flujo crea
 * solicitudes, y qué ocurre al aprobar o rechazar (sobre qué recurso, con qué
 * efecto, quién puede saltarse un paso) es una regla de negocio que no está
 * escrita. Inventarla iría contra CLAUDE.md §11. Llegarán con el primer flujo
 * de negocio que cree solicitudes, junto con el permiso `aprobaciones.aprobar`.
 */
@Injectable()
export class ApprovalsService {
  constructor(@Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository) {}

  list(filter: ApprovalListFilter, page: ApprovalPageRequest): Promise<Page<ApprovalSummaryRecord>> {
    const search = filter.search?.trim();
    return this.repository.list({ status: filter.status, ...(search ? { search } : {}) }, page);
  }

  async get(id: string): Promise<ApprovalDetailRecord> {
    const approval = await this.repository.findById(id);
    if (!approval) {
      throw new ResourceNotFoundError('ApprovalRequest', id);
    }
    return approval;
  }
}
