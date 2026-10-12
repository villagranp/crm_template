import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ATTACHMENT_DESCRIPTION_MAX_LENGTH } from '@/modules/attachments/attachment-policy';
import { ATTACHMENT_SORT_FIELDS, type AttachmentSortField } from '@/modules/attachments/ports/attachments.repository.port';

import { UserRefDto } from './customer.dto';
import { trimToNull } from './dto-transforms';

export class ListCustomerAttachmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ATTACHMENT_SORT_FIELDS, description: 'Por defecto `createdAt` descendente' })
  @IsOptional()
  @IsIn(ATTACHMENT_SORT_FIELDS)
  override sortBy?: AttachmentSortField = undefined;
}

/** Campos de texto del `multipart/form-data` de F18 (además del archivo `file`). */
export class UploadCustomerAttachmentDto {
  @ApiPropertyOptional({ maxLength: ATTACHMENT_DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(ATTACHMENT_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

/** Esquema OpenAPI del cuerpo de F18 (multer lo procesa; no se valida con esta clase). */
export class UploadCustomerAttachmentBodyDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Un archivo: PDF, JPEG, PNG, DOCX o XLSX (por firma), hasta `crm.adjuntos.max_mb`' })
  file!: unknown;

  @ApiPropertyOptional({ maxLength: ATTACHMENT_DESCRIPTION_MAX_LENGTH })
  description?: string;
}

/** Nunca expone la clave ni la ruta de almacenamiento (ADR-021). */
export class AttachmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Nombre saneado, solo para mostrar' }) fileName!: string;
  @ApiProperty({ example: 'application/pdf', description: 'Tipo detectado por firma al guardar' }) contentType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) createdBy!: UserRefDto | null;
}

export class PaginatedAttachmentsResponseDto {
  @ApiProperty({ type: [AttachmentResponseDto] }) data!: AttachmentResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
