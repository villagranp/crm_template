import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsDate, IsEnum, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';

export const ASSIGNMENT_EFFECTS = ['GRANT', 'DENY'] as const;

/**
 * Asignación directa de un permiso o de una opción de menú a un usuario.
 *
 * La razón es obligatoria: una excepción sobre el modelo de roles sin
 * justificación escrita es deuda de seguridad, y el día de la auditoría nadie
 * recuerda por qué se concedió.
 */
export class DirectAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador del permiso o de la opción de menú' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: ASSIGNMENT_EFFECTS, default: 'GRANT' })
  @IsEnum(ASSIGNMENT_EFFECTS)
  effect!: 'GRANT' | 'DENY';

  @ApiProperty({ example: 'Cubre la baja de Juan hasta el 30 de noviembre.' })
  @IsString()
  @Length(10, 300)
  reason!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Vigencia; vacío = sin caducidad' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

export class ReplaceAssignmentsDto {
  @ApiProperty({ type: [DirectAssignmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectAssignmentDto)
  assignments!: DirectAssignmentDto[];
}

export class ReplaceIdsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}
