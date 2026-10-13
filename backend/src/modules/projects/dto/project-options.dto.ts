import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { CountryRefDto } from '@/modules/customers/dto/customer.dto';
import { ConversionUnitDto, UnitOfMeasureDto } from '@/modules/products/dto/product.dto';

import { TeamRefDto } from './project.dto';

export class ProjectCountryOptionDto extends CountryRefDto {
  @ApiProperty({ example: 'GTQ', description: 'Moneda local (ISO 4217): la alternativa a USD en las estimaciones (DM-36)' }) currencyCode!: string;
}

export class CatalogOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiProperty() sortOrder!: number;
}

export class PhaseOptionDto extends CatalogOptionDto {
  @ApiProperty({ description: '`metadata.order` (orden de las fases)' }) order!: number;
  @ApiProperty() isFinal!: boolean;
  @ApiProperty({ nullable: true, type: String, example: '100.00', description: 'Porcentaje propuesto al pasar a esta fase' }) defaultProgress!: string | null;
}

export class StageOptionDto extends CatalogOptionDto {
  @ApiProperty() order!: number;
  @ApiProperty() isClosed!: boolean;
  @ApiProperty({ nullable: true, type: String, enum: ['WON', 'LOST'] }) outcome!: string | null;
}

export class ProductStatusOptionDto extends CatalogOptionDto {
  @ApiProperty({ description: 'Suma en los totales (RN-03.60)' }) isActive!: boolean;
}

export class ProjectFormDefaultsDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '`crm.valores_por_defecto["project.phaseId"]`' }) phaseId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '`crm.valores_por_defecto["opportunity.stageId"]`' }) stageId!: string | null;
}

export class ProgressRuleDto {
  @ApiProperty({ example: 100 }) progresoMinimo!: number;
}

export class ProjectAttachmentLimitsDto {
  @ApiProperty({ example: 10, description: '`crm.adjuntos.max_mb` (ayuda en cliente; decide el servidor)' }) maxMb!: number;
  @ApiProperty({ type: [String], example: ['application/pdf'], description: '`crm.adjuntos.tipos_permitidos`' }) allowedTypes!: string[];
}

/** 03 F.1 `ProjectFormOptionsDto` (D-03.1). Solo elementos activos. */
export class ProjectFormOptionsDto {
  @ApiProperty({ type: [ProjectCountryOptionDto] }) countries!: ProjectCountryOptionDto[];
  @ApiProperty({ type: [CatalogOptionDto] }) projectTypes!: CatalogOptionDto[];
  @ApiProperty({ type: [CatalogOptionDto] }) sectors!: CatalogOptionDto[];
  @ApiProperty({ type: [PhaseOptionDto], description: 'Por `metadata.order`' }) phases!: PhaseOptionDto[];
  @ApiProperty({ type: [StageOptionDto], description: 'Por `metadata.order`' }) stages!: StageOptionDto[];
  @ApiProperty({ type: [UnitOfMeasureDto] }) units!: UnitOfMeasureDto[];
  @ApiProperty({ type: [ProductStatusOptionDto] }) productStatuses!: ProductStatusOptionDto[];
  @ApiProperty({ type: [String], description: 'Base (`name`, `customerId`, `countryId`, `ownerId`) + `crm.campos_obligatorios.project`' })
  requiredFields!: string[];
  @ApiProperty({ type: ProjectFormDefaultsDto }) defaults!: ProjectFormDefaultsDto;
  @ApiProperty({ example: 'USD', description: '`crm.moneda_base`' }) baseCurrencyCode!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/ProgressRuleDto' },
    example: { FINALIZADO: { progresoMinimo: 100 } },
    description: '`crm.proyectos.reglas_avance` por código de fase',
  })
  progressRules!: Record<string, ProgressRuleDto>;
  @ApiProperty({ type: ConversionUnitDto, description: '`crm.forecast.unidad_tonelaje`' }) tonnageUnit!: ConversionUnitDto;
  @ApiProperty({ type: ProjectAttachmentLimitsDto }) attachments!: ProjectAttachmentLimitsDto;
}

export class OwnerOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) countryId!: string | null;
  @ApiProperty({ type: TeamRefDto, nullable: true }) primaryTeam!: TeamRefDto | null;
}

export class PaginatedOwnerOptionsDto {
  @ApiProperty({ type: [OwnerOptionDto] }) data!: OwnerOptionDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class TeamOptionDto extends TeamRefDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) parentId!: string | null;
}

export class TeamOptionsDto {
  @ApiProperty({ type: [TeamOptionDto] }) data!: TeamOptionDto[];
}
