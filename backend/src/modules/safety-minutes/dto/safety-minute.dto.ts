import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { IsCalendarDateString } from '@/common/dto/calendar-date-string.validator';
import { isPresent } from '@/common/dto/dto-transforms';
import { IsNotBeforeFrom } from '@/common/dto/not-before-from.validator';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { IsPlainText, trimPlainText } from '@/common/dto/plain-text.validator';
import { UserRefDto } from '@/common/dto/user-ref.dto';

import { SAFETY_MINUTE_SORT_FIELDS, type SafetyMinuteSortField } from '../ports/safety-minute.repository.port';
import { SAFETY_MINUTE_MESSAGE_MAX } from '../safety-minute-rules';

const DATE_NOTE = 'Fecha de calendario `YYYY-MM-DD` (DM-31)';
const MESSAGE_NOTE =
  `Texto plano de 1 a ${SAFETY_MINUTE_MESSAGE_MAX} caracteres tras recortar; admite saltos de línea y tabulaciones (CRLF se normaliza a LF antes de contar). ` +
  'Exige al menos un carácter visible y rechaza caracteres de control y de formato/bidi (`400 VALIDATION_FAILED`). ' +
  'No admite HTML: se guarda tal cual y la interfaz lo muestra como texto (RN-AJ1.7)';

export class SafetyMinutesQueryDto extends OmitType(PaginationQueryDto, ['search', 'sortBy', 'sortOrder'] as const) {
  @ApiPropertyOptional({ format: 'date', description: `${DATE_NOTE}. Fecha de visualización desde (incluida)` })
  @IsOptional()
  @IsCalendarDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date', description: `${DATE_NOTE}. Fecha de visualización hasta (incluida); \`from\` ≤ \`to\`` })
  @IsOptional()
  @IsCalendarDateString()
  @IsNotBeforeFrom()
  to?: string;

  @ApiPropertyOptional({ enum: SAFETY_MINUTE_SORT_FIELDS, default: 'displayDate' })
  @IsOptional()
  @IsIn(SAFETY_MINUTE_SORT_FIELDS)
  sortBy?: SafetyMinuteSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreateSafetyMinuteDto {
  @ApiProperty({ minLength: 1, maxLength: SAFETY_MINUTE_MESSAGE_MAX, description: MESSAGE_NOTE })
  @Transform(trimPlainText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SAFETY_MINUTE_MESSAGE_MAX)
  @IsPlainText()
  message!: string;

  @ApiProperty({ format: 'date', example: '2026-10-20', description: `${DATE_NOTE}. No puede ser pasada (\`422 SAFETY_MINUTE_PAST_DATE\`)` })
  @IsCalendarDateString()
  displayDate!: string;
}

export class UpdateSafetyMinuteDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: SAFETY_MINUTE_MESSAGE_MAX, description: MESSAGE_NOTE })
  @ValidateIf(isPresent)
  @Transform(trimPlainText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SAFETY_MINUTE_MESSAGE_MAX)
  @IsPlainText()
  message?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-10-21', description: `${DATE_NOTE}. La fecha nueva no puede ser pasada ni estar ocupada` })
  @ValidateIf(isPresent)
  @IsCalendarDateString()
  displayDate?: string;
}

export class SafetyMinuteResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ format: 'date', example: '2026-10-20' }) displayDate!: string;
  @ApiProperty({ description: 'Calculado por el servidor (RN-AJ1.10): hoy y futuros se editan; los pasados son de solo lectura' })
  editable!: boolean;
  @ApiProperty({ description: 'Calculado por el servidor (RN-AJ1.11): solo los futuros se borran' }) deletable!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true, description: 'Último usuario que la registró o editó' })
  updatedBy!: UserRefDto | null;
}

export class PaginatedSafetyMinutesDto {
  @ApiProperty({ type: [SafetyMinuteResponseDto] }) data!: SafetyMinuteResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class TodaySafetyMinuteDto {
  @ApiProperty({ format: 'date', example: '2026-10-14' }) displayDate!: string;
  @ApiProperty() message!: string;
}

export class TodaySafetyMinuteResponseDto {
  @ApiProperty({ type: TodaySafetyMinuteDto, nullable: true, description: '`null` si hoy no hay mensaje: la ausencia no es un error (D-AJ1.3)' })
  safetyMinute!: TodaySafetyMinuteDto | null;
}
