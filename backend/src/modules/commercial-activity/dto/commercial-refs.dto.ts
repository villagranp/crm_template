import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { AttachmentOptionsDto } from '@/modules/customers/dto/customer.dto';

import { AGENDA_STATUS_GROUPS, type AgendaStatusGroup } from '../agenda-status';

import { MAX_FILTER_VALUES, toArray } from './dto-transforms';

/**
 * Referencias compartidas por las respuestas de visitas, actividades, agenda e
 * interacciones (04 F.1–F.3). Prefijo `Commercial` para no chocar en OpenAPI con
 * esquemas homónimos de otros módulos.
 */

export class CommercialUserRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

export class CommercialCatalogRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
}

export class CommercialStatusRefDto extends CommercialCatalogRefDto {
  @ApiProperty({ enum: AGENDA_STATUS_GROUPS, description: 'Grupo derivado de la semántica (RN-04.35); `OVERDUE` = abierta vencida' })
  group!: AgendaStatusGroup;
}

export class CommercialPriorityRefDto extends CommercialCatalogRefDto {
  @ApiProperty({ description: '`metadata.weight` de `crm.prioridad`: mayor peso, más arriba (RN-04.32)' }) weight!: number;
}

export class CommercialCustomerRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CLI-000123' }) crmCode!: string;
  @ApiProperty() legalName!: string;
}

export class CommercialProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
}

export class CommercialProjectDetailRefDto extends CommercialProjectRefDto {
  @ApiProperty({ description: 'Eliminado lógicamente después del vínculo: se sigue mostrando con su marca (G.3)' }) isDeleted!: boolean;
}

export class CommercialOpportunityRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OPO-2026-00042' }) code!: string;
}

export class CommercialOpportunityDetailRefDto extends CommercialOpportunityRefDto {
  @ApiProperty() isDeleted!: boolean;
}

// --- Opciones de responsable (D-04.10) ---

export class OwnerOptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['displayName'], description: 'Único orden admitido: `displayName` ascendente. `search`: contenido en el nombre' })
  @IsOptional()
  @IsIn(['displayName'])
  override sortBy?: 'displayName' = undefined;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Repetible: solo estos usuarios, con el mismo filtro de alcance (resolver el nombre de un asesor ya elegido)',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  id?: string[];
}

/**
 * Contexto común (aditivo) de `GET /visits/form-options` y `GET /activities/form-options`:
 * zonas horarias de presentación (RN-04.9, D-04.17) y límites de adjuntos (D.5).
 */
export class CommercialFormContextDto {
  @ApiProperty({ example: 'America/Guatemala', description: 'Zona del perfil del usuario (`users.time_zone`): instantes (`*_at`)' })
  timeZone!: string;

  @ApiProperty({ example: 'America/Guatemala', description: '`crm.zona_horaria_negocio`: fechas sin hora y "hoy" (`nextActionDate`)' })
  businessTimeZone!: string;

  @ApiProperty({ type: AttachmentOptionsDto, description: '`crm.adjuntos.max_mb` y `crm.adjuntos.tipos_permitidos` (validación previa en el navegador)' })
  attachments!: AttachmentOptionsDto;
}

export class PaginatedOwnerOptionsDto {
  @ApiProperty({ type: [CommercialUserRefDto] }) data!: CommercialUserRefDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
