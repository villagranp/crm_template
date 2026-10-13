import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { CatalogValueDto, UserRefDto } from '@/modules/customers/dto/customer.dto';
import { trim } from '@/modules/customers/dto/dto-transforms';
import { IsCalendarDateString, isNotNull, PROGRESS_PATTERN } from '@/modules/projects/dto/dto-helpers';

import { OUTCOMES } from '../opportunity-result-rules';

const DATE_NOTE = 'Fecha de calendario `YYYY-MM-DD` (DM-31), sin desplazamiento de zona';

/**
 * Resultado comercial que se registra al cerrar (`stage-changes`) o se modifica sin
 * cambiar de etapa (`PUT /opportunities/{id}/result`) (03 C.8, RN-03.46–RN-03.52).
 */
export class OpportunityResultInputDto {
  @ApiProperty({ enum: OUTCOMES, description: '`WON`/`PARTIAL` → etapa con `outcome = WON`; `LOST` → etapa con `outcome = LOST` (RN-03.47)' })
  @IsIn(OUTCOMES)
  outcome!: 'WON' | 'LOST' | 'PARTIAL';

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: '`crm.motivo_resultado` activo cuyo `appliesTo` incluye el resultado. Obligatorio con `LOST` (`422 RESULT_REASON_REQUIRED`)',
  })
  @IsOptional()
  @ValidateIf(isNotNull)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  reasonId?: string | null;

  @ApiPropertyOptional({
    example: '60.00',
    nullable: true,
    description: 'Porcentaje adjudicado 0–100 con hasta 2 decimales. Obligatorio con `PARTIAL`; no se admite con `WON` ni `LOST` (DM-15)',
  })
  @IsOptional()
  @ValidateIf(isNotNull)
  @IsString()
  @Matches(PROGRESS_PATTERN, { message: 'awardedPercent must be a decimal with up to 2 decimals' })
  awardedPercent?: string | null;

  @ApiProperty({ format: 'date', description: DATE_NOTE })
  @IsCalendarDateString()
  decisionDate!: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @ValidateIf(isNotNull)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  comments?: string | null;
}

export class OpportunityResultDto {
  @ApiProperty({ enum: OUTCOMES }) outcome!: string;
  @ApiProperty({ example: 'Parcial', description: 'Etiqueta de `crm.resultado_oportunidad`' }) outcomeLabel!: string;
  @ApiProperty({ type: CatalogValueDto, nullable: true }) reason!: CatalogValueDto | null;
  @ApiProperty({ example: '60.00', nullable: true, type: String, description: 'Solo en `PARTIAL`' }) awardedPercent!: string | null;
  @ApiProperty({ format: 'date' }) decisionDate!: string;
  @ApiProperty({ nullable: true, type: String }) comments!: string | null;
  @ApiProperty({ type: UserRefDto }) recordedBy!: UserRefDto;
  @ApiProperty({ format: 'date-time' }) recordedAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) updatedBy!: UserRefDto | null;
}

export class OpportunityResultSummaryDto {
  @ApiProperty({ enum: OUTCOMES }) outcome!: string;
  @ApiProperty({ example: '60.00', nullable: true, type: String }) awardedPercent!: string | null;
  @ApiProperty({ format: 'date' }) decisionDate!: string;
}

export class ResultHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['RECORDED', 'CHANGED', 'CLEARED'] }) action!: string;
  @ApiProperty({ enum: OUTCOMES, nullable: true, type: String, description: 'Nulo en `CLEARED`' }) outcome!: string | null;
  @ApiProperty({ type: CatalogValueDto, nullable: true }) reason!: CatalogValueDto | null;
  @ApiProperty({ nullable: true, type: String }) awardedPercent!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) decisionDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) comments!: string | null;
  @ApiProperty({ type: UserRefDto }) changedBy!: UserRefDto;
  @ApiProperty({ format: 'date-time' }) changedAt!: string;
}
