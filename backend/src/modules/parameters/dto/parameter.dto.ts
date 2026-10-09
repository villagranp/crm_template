import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { MAX_JSON_LENGTH } from '../parameter-value';

const PARAMETER_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'DATE'] as const;

export class ParameterResponseDto {
  @ApiProperty({ example: 'seguridad.minutos_bloqueo' })
  key!: string;

  @ApiProperty({ example: '15', description: 'Siempre texto; se interpreta según `type`' })
  value!: string;

  @ApiProperty({ enum: PARAMETER_TYPES })
  type!: (typeof PARAMETER_TYPES)[number];

  @ApiProperty({ example: 'seguridad' })
  group!: string;

  @ApiProperty({ example: 'Minutos de bloqueo' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ description: 'Visible para clientes no administradores' })
  isPublic!: boolean;

  @ApiProperty({ description: 'Lo lee el código de la plantilla' })
  isSystem!: boolean;

  @ApiProperty({ description: 'Editarlo exige además parametros.configurar (grupo seguridad)' })
  requiresConfigurePermission!: boolean;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ParameterGroupResponseDto {
  @ApiProperty({ example: 'seguridad' })
  group!: string;

  @ApiProperty({ type: [ParameterResponseDto] })
  parameters!: ParameterResponseDto[];
}

export class ParameterListResponseDto {
  @ApiProperty({ type: [ParameterGroupResponseDto], description: 'Grupos ordenados por nombre; dentro, por clave' })
  data!: ParameterGroupResponseDto[];
}

export class UpdateParameterDto {
  @ApiProperty({
    example: '10',
    description: 'Nuevo valor como texto. Se valida según el tipo del parámetro y, en las claves conocidas, su rango.',
  })
  @IsString()
  @MaxLength(MAX_JSON_LENGTH)
  value!: string;
}
