import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { ATTACHMENT_DESCRIPTION_MAX_LENGTH } from '@/modules/attachments/attachment-policy';
import { ATTACHMENT_SORT_FIELDS, type AttachmentSortField } from '@/modules/attachments/ports/attachments.repository.port';

import { PaginationWithoutSearchQueryDto } from './pagination-without-search.dto';
import { trimToNull } from './dto-transforms';

/**
 * Adjuntos de visitas, eventos de visita y actividades (04 F.4, DC-2, ADR-021). La
 * respuesta reutiliza `AttachmentResponseDto` de 02 (mismo esquema OpenAPI para
 * todos los dueños): nunca expone la clave ni la ruta de almacenamiento.
 */

export class ListCommercialAttachmentsQueryDto extends PaginationWithoutSearchQueryDto {
  @ApiPropertyOptional({ enum: ATTACHMENT_SORT_FIELDS, description: 'Por defecto `createdAt` descendente' })
  @IsOptional()
  @IsIn(ATTACHMENT_SORT_FIELDS)
  override sortBy?: AttachmentSortField = undefined;
}

/** Campos de texto del `multipart/form-data` (además del archivo `file`). */
export class UploadCommercialAttachmentDto {
  @ApiPropertyOptional({ maxLength: ATTACHMENT_DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(ATTACHMENT_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

/** Esquema OpenAPI del cuerpo de subida (multer lo procesa; no se valida con esta clase). */
export class UploadCommercialAttachmentBodyDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Un archivo: PDF, JPEG, PNG, DOCX o XLSX (por firma), hasta `crm.adjuntos.max_mb`' })
  file!: unknown;

  @ApiPropertyOptional({ maxLength: ATTACHMENT_DESCRIPTION_MAX_LENGTH })
  description?: string;
}
