import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

import { IsCalendarDateString } from '@/common/dto/calendar-date-string.validator';
import { isPresent, trim, trimToNull } from '@/common/dto/dto-transforms';
import { IsNotBeforeFrom } from '@/common/dto/not-before-from.validator';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { UserRefDto } from '@/common/dto/user-ref.dto';

import { EXCHANGE_RATE_NOTES_MAX, EXCHANGE_RATE_SOURCE_MAX, RATE_PATTERN } from '../exchange-rate-maintenance-rules';
import { EXCHANGE_RATE_SORT_FIELDS, type ExchangeRateSortField } from '../ports/exchange-rate.repository.port';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_NOTE = 'Fecha de calendario `YYYY-MM-DD` (DM-31)';
const RATE_NOTE =
  'Unidades de la moneda por 1 USD, como **cadena** decimal (hasta 11 enteros y 8 decimales, `Decimal(19, 8)`). ' +
  'Un número JSON es `400`; `0` o negativo es `422 INVALID_EXCHANGE_RATE` (`non_positive_rate`)';

function toUpperCaseCode({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class ExchangeRatesQueryDto extends OmitType(PaginationQueryDto, ['search', 'sortBy', 'sortOrder'] as const) {
  @ApiPropertyOptional({ example: 'GTQ', description: 'ISO 4217 (sin distinguir mayúsculas)' })
  @IsOptional()
  @Transform(toUpperCaseCode)
  @IsString()
  @Matches(CURRENCY_PATTERN, { message: 'currencyCode must be an ISO 4217 code (three letters)' })
  currencyCode?: string;

  @ApiPropertyOptional({ format: 'date', description: `${DATE_NOTE}. Vigencia desde (incluida)` })
  @IsOptional()
  @IsCalendarDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date', description: `${DATE_NOTE}. Vigencia hasta (incluida); \`from\` ≤ \`to\`` })
  @IsOptional()
  @IsCalendarDateString()
  @IsNotBeforeFrom()
  to?: string;

  @ApiPropertyOptional({ enum: EXCHANGE_RATE_SORT_FIELDS, default: 'effectiveDate' })
  @IsOptional()
  @IsIn(EXCHANGE_RATE_SORT_FIELDS)
  sortBy?: ExchangeRateSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreateExchangeRateDto {
  @ApiProperty({ example: 'GTQ', description: 'ISO 4217 de una moneda activa distinta de la base (`USD`)' })
  @Transform(toUpperCaseCode)
  @IsString()
  @Matches(CURRENCY_PATTERN, { message: 'currencyCode must be an ISO 4217 code (three letters)' })
  currencyCode!: string;

  @ApiProperty({ format: 'date', example: '2026-10-01', description: `${DATE_NOTE}. Inmutable una vez creada` })
  @IsCalendarDateString()
  effectiveDate!: string;

  @ApiProperty({ example: '7.75', description: RATE_NOTE })
  @IsString()
  @Matches(RATE_PATTERN, { message: 'ratePerUsd must be a decimal string with up to 11 integer digits and 8 decimals' })
  ratePerUsd!: string;

  @ApiProperty({ example: 'Banco de Guatemala', minLength: 1, maxLength: EXCHANGE_RATE_SOURCE_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXCHANGE_RATE_SOURCE_MAX)
  source!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: EXCHANGE_RATE_NOTES_MAX, description: 'Vacía equivale a `null`' })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(EXCHANGE_RATE_NOTES_MAX)
  notes?: string | null;
}

/**
 * Corrección (RN-07.44): solo tasa, fuente y notas. `currencyCode` y `effectiveDate`
 * no se declaran, así que enviarlos es `400 VALIDATION_FAILED` (`forbidNonWhitelisted`).
 */
export class UpdateExchangeRateDto {
  @ApiPropertyOptional({ example: '7.80', description: RATE_NOTE })
  @ValidateIf(isPresent)
  @IsString()
  @Matches(RATE_PATTERN, { message: 'ratePerUsd must be a decimal string with up to 11 integer digits and 8 decimals' })
  ratePerUsd?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: EXCHANGE_RATE_SOURCE_MAX })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXCHANGE_RATE_SOURCE_MAX)
  source?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: EXCHANGE_RATE_NOTES_MAX, description: '`null` o vacía borra las notas' })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(EXCHANGE_RATE_NOTES_MAX)
  notes?: string | null;
}

export class ExchangeRateResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'GTQ' }) currencyCode!: string;
  @ApiProperty({ format: 'date', example: '2026-10-01' }) effectiveDate!: string;
  @ApiProperty({ example: '7.75000000', description: 'Cadena decimal con 8 decimales: unidades de la moneda por 1 USD' }) ratePerUsd!: string;
  @ApiProperty({ example: 'Banco de Guatemala' }) source!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true, description: 'Último usuario que la registró o corrigió; `null` en la carga inicial' })
  updatedBy!: UserRefDto | null;
}

export class PaginatedExchangeRatesDto {
  @ApiProperty({ type: [ExchangeRateResponseDto] }) data!: ExchangeRateResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class CurrencyResponseDto {
  @ApiProperty({ example: 'GTQ' }) code!: string;
  @ApiProperty({ example: 'Quetzal guatemalteco' }) name!: string;
  @ApiProperty({ example: 'Q' }) symbol!: string;
  @ApiProperty({ example: 2, description: 'Decimales de presentación' }) decimals!: number;
  @ApiProperty() isActive!: boolean;
}

export class CurrencyListResponseDto {
  @ApiProperty({ type: [CurrencyResponseDto], description: 'Todas las monedas, por código; sin paginar (cinco filas sembradas)' })
  data!: CurrencyResponseDto[];
}
