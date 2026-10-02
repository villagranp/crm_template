import { ApiProperty } from '@nestjs/swagger';

class ProfileTeamDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ventas Norte' })
  name!: string;
}

/** Perfil del usuario autenticado, con su acceso ya resuelto por el servidor. */
export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Beltrán' })
  displayName!: string;

  @ApiProperty({ example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ type: [String], example: ['administrador'] })
  roles!: string[];

  @ApiProperty({ type: [String], example: ['usuarios.ver', 'roles.ver'] })
  permissions!: string[];

  @ApiProperty({ type: [ProfileTeamDto] })
  teams!: ProfileTeamDto[];

  @ApiProperty({ enum: ['OWN', 'TEAM', 'TERRITORY', 'ORGANIZATION'] })
  dataScope!: 'OWN' | 'TEAM' | 'TERRITORY' | 'ORGANIZATION';
}
