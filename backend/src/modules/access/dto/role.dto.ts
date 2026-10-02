import { ApiProperty } from '@nestjs/swagger';

export const DATA_SCOPES = ['OWN', 'TEAM', 'TERRITORY', 'ORGANIZATION'] as const;

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'administrador' })
  code!: string;

  @ApiProperty({ example: 'Administrador' })
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: DATA_SCOPES })
  dataScope!: (typeof DATA_SCOPES)[number];

  @ApiProperty({ description: 'Rol del sistema: no se puede borrar ni renombrar' })
  isSystem!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: [String], example: ['usuarios.ver'] })
  permissionCodes!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  menuOptionIds!: string[];

  @ApiProperty({ example: 4 })
  userCount!: number;
}

export class PermissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'usuarios.crear' })
  code!: string;

  @ApiProperty({ example: 'usuarios' })
  resource!: string;

  @ApiProperty({ example: 'crear' })
  action!: string;

  @ApiProperty({ example: 'Crear usuarios' })
  name!: string;

  @ApiProperty({ nullable: true, example: 'administracion' })
  moduleKey!: string | null;
}
