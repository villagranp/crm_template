import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';

import { ApprovalsService } from './approvals.service';
import {
  ApprovalDetailDto,
  ApprovalPageResponseDto,
  type ApprovalSummaryDto,
  ListApprovalsQueryDto,
} from './dto/approval.dto';
import type { ApprovalDetailRecord, ApprovalSummaryRecord } from './ports/approvals.repository.port';

function toSummary(record: ApprovalSummaryRecord): ApprovalSummaryDto {
  return {
    id: record.id,
    code: record.code,
    title: record.title,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    status: record.status,
    requestedBy: { id: record.requestedBy.id, displayName: record.requestedBy.displayName },
    stepCount: record.stepCount,
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  };
}

function toDetail(record: ApprovalDetailRecord): ApprovalDetailDto {
  return {
    ...toSummary(record),
    reason: record.reason,
    payload: record.payload ?? null,
    updatedAt: record.updatedAt.toISOString(),
    steps: record.steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      status: step.status,
      approver: step.approver ? { id: step.approver.id, displayName: step.approver.displayName } : null,
      approverRole: step.approverRole ? { id: step.approverRole.id, name: step.approverRole.name } : null,
      comment: step.comment,
      createdAt: step.createdAt.toISOString(),
      resolvedAt: step.resolvedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Bandeja de aprobaciones, de solo lectura (PLAN-ADMIN, D12).
 *
 * Deliberadamente sin POST/PATCH (crear, aprobar, rechazar): las reglas de
 * resolución no están definidas (CLAUDE.md §11). Ver `ApprovalsService`.
 */
@ApiTags('Administración · Aprobaciones')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @RequirePermission('aprobaciones.ver')
  @ApiOperation({ summary: 'Solicitudes de aprobación, paginadas y filtrables por estado' })
  @ApiOkResponse({ type: ApprovalPageResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Filtro, orden o paginación inválidos' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso aprobaciones.ver' })
  async list(@Query() query: ListApprovalsQueryDto): Promise<PaginatedResponseDto<ApprovalSummaryDto>> {
    const { page, pageSize, sortBy, sortOrder, status, search } = query;
    const result = await this.approvalsService.list({ status, search }, { page, pageSize, sortBy, sortOrder });
    return PaginatedResponseDto.of(result.items.map(toSummary), page, pageSize, result.totalItems);
  }

  @Get(':id')
  @RequirePermission('aprobaciones.ver')
  @ApiOperation({ summary: 'Detalle de una solicitud con su cadena de pasos' })
  @ApiOkResponse({ type: ApprovalDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'El identificador no es un UUID' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso aprobaciones.ver' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ApprovalDetailDto> {
    return toDetail(await this.approvalsService.get(id));
  }
}
