import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { trimToNull } from '@/common/dto/dto-transforms';

import { OpportunityResultInputDto } from './opportunity-result.dto';

/** 03 F.2 `CreateStageChangeDto`: cambio de etapa (y resultado si la destino es cerrada). */
export class CreateStageChangeDto {
  @ApiProperty({ format: 'uuid', description: 'Etapa destino activa de `crm.etapa_oportunidad`' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  toStageId!: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Obligatorio para reabrir (`422 COMMENT_REQUIRED`, RN-03.42)' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ApiPropertyOptional({
    type: OpportunityResultInputDto,
    description: 'Obligatorio si la destino es cerrada (`422 RESULT_REQUIRED`); prohibido si es abierta (`422 RESULT_NOT_ALLOWED`)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OpportunityResultInputDto)
  result?: OpportunityResultInputDto;
}
