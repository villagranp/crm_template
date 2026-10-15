import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { MAX_JSON_LENGTH } from '../parameter-value';

const PARAMETER_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'DATE'] as const;

export class ParameterRangeDto {
  @ApiProperty({ example: 1 }) min!: number;
  @ApiProperty({ example: 366 }) max!: number;
}

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

  @ApiProperty({ description: 'Editarlo exige además parametros.configurar (grupo seguridad o estructural). Alias de `requiresConfigure`' })
  requiresConfigurePermission!: boolean;

  @ApiProperty({ description: 'Editarlo exige además parametros.configurar (RN-07.32)' })
  requiresConfigure!: boolean;

  @ApiProperty({ description: 'No editable desde la API (p. ej. crm.moneda_base): PATCH → 409 SYSTEM_RESOURCE_READ_ONLY' })
  readOnly!: boolean;

  @ApiProperty({ type: [String], nullable: true, description: 'Valores admitidos, si es una lista cerrada' })
  allowedValues!: string[] | null;

  @ApiProperty({ type: String, nullable: true, example: 'number', description: 'Editor sugerido para la interfaz (registro de reglas)' })
  editor!: string | null;

  @ApiProperty({ type: ParameterRangeDto, nullable: true, description: 'Rango numérico admitido' })
  range!: ParameterRangeDto | null;

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

export class AuthenticationSettingsResponseDto {
  @ApiProperty({ enum: ['local', 'entra', 'hybrid'], description: 'Proveedor vigente (`AUTH_PROVIDER`). Solo lectura: cambiarlo es un despliegue (ADR-019)' })
  provider!: 'local' | 'entra' | 'hybrid';

  @ApiProperty({ description: '`false` con `entra`: los parámetros de login local no aplican' })
  localLoginEnabled!: boolean;

  @ApiProperty({
    type: [String],
    example: ['seguridad.intentos_fallidos_maximos', 'seguridad.minutos_bloqueo', 'seguridad.dias_caducidad_password'],
    description:
      'Claves de los parámetros de login local. Se editan con `PATCH /parameters/{key}`, que exige `parametros.editar` y además `parametros.configurar` (como todo `seguridad.*` y los estructurales)',
  })
  securityParameterKeys!: string[];
}
