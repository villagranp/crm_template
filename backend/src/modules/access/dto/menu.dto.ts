import { ApiProperty } from '@nestjs/swagger';

export class MenuOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'admin-usuarios' })
  key!: string;

  @ApiProperty({ example: 'Usuarios' })
  label!: string;

  @ApiProperty({ nullable: true, example: 'manage_accounts', description: 'Glifo de Material Symbols' })
  icon!: string | null;

  @ApiProperty({ nullable: true, example: '/administracion/usuarios' })
  path!: string | null;

  @ApiProperty({ example: 10 })
  order!: number;

  @ApiProperty({ nullable: true, example: 'usuarios.ver' })
  requiredPermission!: string | null;

  @ApiProperty({ type: () => [MenuOptionDto] })
  children!: MenuOptionDto[];
}

export class MenuModuleDto {
  @ApiProperty({ example: 'administracion' })
  key!: string;

  @ApiProperty({ example: 'Administración' })
  label!: string;

  @ApiProperty({ nullable: true, example: 'settings' })
  icon!: string | null;

  @ApiProperty({ example: 90 })
  order!: number;

  @ApiProperty({ description: 'Módulo de sistema (Administración): el menú lo agrupa en "Sistema"', example: true })
  isSystem!: boolean;

  @ApiProperty({ type: [MenuOptionDto] })
  options!: MenuOptionDto[];
}
