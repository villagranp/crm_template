import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { UserRefDto } from '@/modules/customers/dto/customer.dto';
import { trimToNull } from '@/modules/customers/dto/dto-transforms';
import { ProductFamilyRefDto, UnitRefDto } from '@/modules/products/dto/product.dto';
import { MAX_FILTER_VALUES, QUANTITY_PATTERN, toList, toUuidList } from '@/modules/projects/dto/dto-helpers';
import { LineConversionDto, QuantityByUnitDto } from '@/modules/projects/dto/project-subresources.dto';

import { MAX_BATCH_LINES, MAX_NOTES_LENGTH } from '../forecast-batch-validator';
import { FORECAST_MODES, type ForecastMode, HISTORY_MAX_MONTHS, PERIOD_LABEL_PATTERN } from '../forecast-window';
import { FORECAST_SORT_FIELDS, type ForecastSortField } from '../ports/forecast.repository.port';

const LIST_NOTE = 'Repetible: valores separados por comas (`a,b`) o el parámetro repetido; se combinan con O dentro del filtro';
const QUANTITY_NOTE = 'Cadena decimal (hasta 15 enteros y 4 decimales). Negativa → `422 INVALID_QUANTITY`';

function uuidList(): PropertyDecorator {
  return (target: object, property: string | symbol) => {
    IsOptional()(target, property);
    Transform(toUuidList)(target, property);
    IsArray()(target, property);
    ArrayMaxSize(MAX_FILTER_VALUES)(target, property);
    IsUUID('all', { each: true })(target, property);
  };
}

// ---------------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------------

export class YearMonthDto {
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ minimum: 1, maximum: 12, example: 12 }) month!: number;
}

export class ForecastWindowPeriodDto extends YearMonthDto {
  @ApiProperty({ example: 1, description: 'M+offset (1 … `crm.forecast.horizonte_meses`)' }) offset!: number;
  @ApiProperty({ example: '2027-01', description: '`YYYY-MM`' }) label!: string;
}

export class ForecastWindowDto {
  @ApiProperty({ example: 'America/Guatemala', description: '`crm.zona_horaria_negocio`' }) timeZone!: string;
  @ApiProperty({ type: YearMonthDto, description: 'Mes en curso (M) en la zona del negocio: de solo lectura' }) current!: YearMonthDto;
  @ApiProperty({ type: [ForecastWindowPeriodDto], description: 'M+1 … M+N: los únicos períodos editables (RN-03.66, D-03.5)' })
  periods!: ForecastWindowPeriodDto[];
}

// ---------------------------------------------------------------------------
// Consulta común de filas y totales
// ---------------------------------------------------------------------------

/** 03 F.3 `ForecastQueryDto` (`GET /forecast/rows`, `GET /forecast/totals`). Filtros combinados con Y. */
export class ForecastQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: FORECAST_SORT_FIELDS,
    description: 'Por defecto `projectCode asc` (y `productSku asc`). `updatedAt` = actualización más reciente de la fila (nulas al final). Ignorado en totales',
  })
  @IsOptional()
  @IsIn(FORECAST_SORT_FIELDS)
  override sortBy?: ForecastSortField = undefined;

  @ApiPropertyOptional({ enum: FORECAST_MODES, default: 'WINDOW', description: '`WINDOW` = M+1 … M+N editable; `HISTORY` = rango `from`–`to`, solo lectura' })
  @IsOptional()
  @IsIn(FORECAST_MODES)
  mode: ForecastMode = 'WINDOW';

  @ApiPropertyOptional({ type: String, description: `Proyecto(s). ${LIST_NOTE}` })
  @uuidList()
  projectId?: string[];

  @ApiPropertyOptional({ type: String, description: `Producto(s). ${LIST_NOTE}` })
  @uuidList()
  productId?: string[];

  @ApiPropertyOptional({ type: String, description: `Asesor(es): responsable del proyecto o de alguna línea visible de la fila en los períodos consultados. ${LIST_NOTE}` })
  @uuidList()
  ownerId?: string[];

  @ApiPropertyOptional({
    type: String,
    example: '2026-11,2026-12',
    description: `Solo \`WINDOW\`: período(s) \`YYYY-MM\` de la ventana (fuera → \`422 FORECAST_PERIOD_OUT_OF_WINDOW\`; con \`HISTORY\` → \`400\`). Omitido: toda la ventana. ${LIST_NOTE}`,
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(HISTORY_MAX_MONTHS)
  @Matches(PERIOD_LABEL_PATTERN, { each: true })
  periods?: string[];

  @ApiPropertyOptional({
    example: '2026-05',
    description: `Solo \`HISTORY\` (con \`WINDOW\` → \`400\`). \`YYYY-MM\` inclusive. Omitido: \`to\` − (N − 1). Máximo ${HISTORY_MAX_MONTHS} meses y \`from ≤ to\` (\`422 INVALID_DATE_RANGE\`)`,
  })
  @IsOptional()
  @IsString()
  @Matches(PERIOD_LABEL_PATTERN)
  from?: string;

  @ApiPropertyOptional({ example: '2026-10', description: 'Solo `HISTORY`. `YYYY-MM` inclusive. Omitido: el mes en curso (M)' })
  @IsOptional()
  @IsString()
  @Matches(PERIOD_LABEL_PATTERN)
  to?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Contenido en el código o en el nombre (sin mayúsculas ni acentos) del proyecto, o en el SKU' })
  override search?: string = undefined;
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

export class ForecastProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: UserRefDto, description: 'Asesor del proyecto (asesor por defecto de las líneas, DM-25)' }) owner!: UserRefDto;
}

export class ForecastProductRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VAR-3' }) sku!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: ProductFamilyRefDto }) family!: ProductFamilyRefDto;
}

export class ForecastCellDto extends YearMonthDto {
  @ApiProperty({ example: 1, description: 'Desplazamiento respecto de M (M+1 → 1; pasados ≤ 0)' }) offset!: number;
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '`null` = celda vacía' }) lineId!: string | null;
  @ApiProperty({ example: '120.0000', nullable: true, type: String }) quantity!: string | null;
  @ApiProperty({ type: UnitRefDto, nullable: true }) unit!: UnitRefDto | null;
  @ApiProperty({ example: '0.4000', nullable: true, type: String, description: 'Toneladas; `null` = "sin conversión" o celda vacía' }) tonnage!: string | null;
  @ApiProperty({ description: 'Línea: tiene tonelaje. Celda vacía: la fila tiene regla para su unidad propuesta' }) hasConversion!: boolean;
  @ApiProperty({ type: UserRefDto, nullable: true, description: 'Asesor de la línea' }) owner!: UserRefDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'Valor para `expectedUpdatedAt`' }) updatedAt!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) updatedBy!: UserRefDto | null;
  @ApiProperty({ description: '`canEdit` de la fila, asociación activa del producto (`hasActiveAssociation`), modo `WINDOW` y período M+1 … M+N' })
  editable!: boolean;
}

export class ForecastRowTotalsDto {
  @ApiProperty({ example: '1.6100', description: 'Toneladas de las celdas con conversión' }) tonnage!: string;
  @ApiProperty({ type: [QuantityByUnitDto], description: 'Cantidades por unidad, nunca mezcladas' }) quantitiesByUnit!: QuantityByUnitDto[];
}

export class ForecastRowDto {
  @ApiProperty({ type: ForecastProjectRefDto }) project!: ForecastProjectRefDto;
  @ApiProperty({ type: ForecastProductRefDto }) product!: ForecastProductRefDto;
  @ApiProperty({ type: UnitRefDto, description: 'Unidad propuesta para celdas nuevas: la de la asociación activa (sin oportunidad primero, luego la más antigua) o la base del producto' })
  unit!: UnitRefDto;
  @ApiProperty({ type: LineConversionDto, nullable: true, description: 'Regla vigente para `unit` (vista previa del tonelaje); `null` = "sin conversión"' })
  conversion!: LineConversionDto | null;
  @ApiProperty({ type: [ForecastCellDto], description: 'Una celda por período consultado, en orden' }) cells!: ForecastCellDto[];
  @ApiProperty({ type: ForecastRowTotalsDto }) rowTotals!: ForecastRowTotalsDto;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: '`updatedAt` más reciente de las celdas' }) lastUpdatedAt!: string | null;
  @ApiProperty({ description: 'Política de edición (RN-03.71): `forecast.editar` + proyecto propio, o `forecast.administrar` en su alcance; proyecto visible' })
  canEdit!: boolean;
  @ApiProperty({
    description:
      'El producto tiene hoy una asociación activa con el proyecto (RN-03.68). Sin ella la fila solo muestra líneas históricas y ninguna celda es editable',
  })
  hasActiveAssociation!: boolean;
}

export class PaginatedForecastRowsDto {
  @ApiProperty({ type: [ForecastRowDto] }) data!: ForecastRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Totales
// ---------------------------------------------------------------------------

export class ForecastPeriodTotalDto extends YearMonthDto {
  @ApiProperty({ example: 1 }) offset!: number;
  @ApiProperty({ example: '12.5000', description: 'Toneladas del período (solo líneas con conversión)' }) tonnage!: string;
  @ApiProperty({ example: '30.0000', description: 'Suma corrida desde el primer período consultado' }) accumulatedTonnage!: string;
}

export class ForecastPeriodQuantityDto extends YearMonthDto {
  @ApiProperty({ example: '480.0000' }) quantity!: string;
}

export class ForecastUnitTotalDto {
  @ApiProperty({ type: UnitRefDto }) unit!: UnitRefDto;
  @ApiProperty({ type: [ForecastPeriodQuantityDto], description: 'Una entrada por período consultado (cero si no hay)' }) byPeriod!: ForecastPeriodQuantityDto[];
  @ApiProperty({ example: '960.0000' }) total!: string;
}

export class ForecastTotalsDto {
  @ApiProperty({ type: [ForecastPeriodTotalDto] }) periods!: ForecastPeriodTotalDto[];
  @ApiProperty({ example: '75.2500', description: 'Total de toneladas de la ventana o del rango consultado' }) windowTonnage!: string;
  @ApiProperty({ type: [ForecastUnitTotalDto], description: 'Cantidades por unidad, nunca mezcladas' }) quantitiesByUnit!: ForecastUnitTotalDto[];
  @ApiProperty({ example: 3, description: 'Líneas sin conversión: no suman toneladas (RN-03.31)' }) linesWithoutConversion!: number;
}

// ---------------------------------------------------------------------------
// Guardado en lote
// ---------------------------------------------------------------------------

export class ForecastLineInputDto {
  @ApiProperty({ format: 'uuid', description: 'Proyecto visible y editable (`404` / `403`)' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  projectId!: string;

  @ApiProperty({ format: 'uuid', description: 'Producto con asociación activa en el proyecto (`422 PRODUCT_NOT_ASSOCIATED`)' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 2000, maximum: 2100, example: 2027 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 1, description: 'El período debe ser M+1 … M+N (`422 FORECAST_PERIOD_OUT_OF_WINDOW`)' })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: '120', description: `${QUANTITY_NOTE}. \`0\` conserva la línea ("quitar" la proyección, RN-03.65)` })
  @IsString()
  @Matches(QUANTITY_PATTERN)
  quantity!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Unidad activa (`422 UNKNOWN_REFERENCE`). Omitida: la de la línea existente; en una línea nueva, la de la asociación activa',
  })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Omitido: el de la línea existente; en una línea nueva, el asesor del proyecto. Distinto del asesor del proyecto → exige `forecast.administrar` ' +
      '(`403 FIELD_NOT_EDITABLE`) y un usuario asignable (`422 INVALID_OWNER`)',
  })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ maxLength: MAX_NOTES_LENGTH, nullable: true, type: String, description: 'Omitido: se conserva; `null` o vacío: se borra' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string | null;

  @ApiPropertyOptional({
    format: 'date-time',
    description: '`updatedAt` de la celda que vio el cliente. Distinto del actual (al milisegundo) → `409 FORECAST_LINE_STALE` y nada se guarda',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;
}

export class SaveForecastLinesDto {
  @ApiProperty({ type: [ForecastLineInputDto], minItems: 1, maxItems: MAX_BATCH_LINES, description: `1 … ${MAX_BATCH_LINES} líneas; todas o ninguna (RN-03.72)` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_LINES)
  @ValidateNested({ each: true })
  @Type(() => ForecastLineInputDto)
  lines!: ForecastLineInputDto[];
}

export class SavedForecastLineDto extends YearMonthDto {
  @ApiProperty({ format: 'uuid' }) lineId!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ example: '120.0000' }) quantity!: string;
  @ApiProperty({ type: UnitRefDto }) unit!: UnitRefDto;
  @ApiProperty({ example: '0.4000', nullable: true, type: String, description: '`null` = "sin conversión"' }) tonnage!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ForecastSaveResultDto {
  @ApiProperty({ example: 2 }) created!: number;
  @ApiProperty({ example: 1 }) updated!: number;
  @ApiProperty({ example: 2, description: 'Líneas iguales a lo guardado (cantidad, unidad, asesor y notas): ni se escriben ni se auditan' }) unchanged!: number;
  @ApiProperty({ type: [SavedForecastLineDto], description: 'En el orden del lote' }) lines!: SavedForecastLineDto[];
}
