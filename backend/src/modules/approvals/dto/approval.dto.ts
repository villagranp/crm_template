import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { MAX_PAGE_SIZE } from '@/common/dto/pagination-query.dto';

import {
  APPROVAL_SORTABLE_FIELDS,
  APPROVAL_STATUSES,
  type ApprovalSortField,
  type ApprovalStatus,
} from '../ports/approvals.repository.port';

export class ListApprovalsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = 20;

  @ApiPropertyOptional({ enum: APPROVAL_SORTABLE_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(APPROVAL_SORTABLE_FIELDS)
  sortBy: ApprovalSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Busca en código y título' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: APPROVAL_STATUSES })
  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  status?: ApprovalStatus;
}

export class PersonRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

export class RoleRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class ApprovalSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'APR-0001' }) code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: 'user' }) resourceType!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty({ enum: APPROVAL_STATUSES }) status!: ApprovalStatus;
  @ApiProperty({ type: PersonRefDto }) requestedBy!: PersonRefDto;
  @ApiProperty({ description: 'Número de pasos de la cadena' }) stepCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) resolvedAt!: string | null;
}

export class ApprovalStepDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sequence!: number;
  @ApiProperty({ enum: APPROVAL_STATUSES }) status!: ApprovalStatus;
  @ApiProperty({ type: PersonRefDto, nullable: true }) approver!: PersonRefDto | null;
  @ApiProperty({ type: RoleRefDto, nullable: true, description: 'Rol que puede resolver el paso si no hay persona' })
  approverRole!: RoleRefDto | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) resolvedAt!: string | null;
}

export class ApprovalDetailDto extends ApprovalSummaryDto {
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Instantánea de lo que se aprueba, tal como se guardó',
  })
  payload!: unknown;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [ApprovalStepDto] }) steps!: ApprovalStepDto[];
}

export class ApprovalPageResponseDto {
  @ApiProperty({ type: [ApprovalSummaryDto] }) data!: ApprovalSummaryDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
