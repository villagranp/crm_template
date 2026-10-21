import { ApiProperty } from '@nestjs/swagger';

export class SessionUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ type: [String], description: 'Códigos de rol' })
  roles!: string[];

  @ApiProperty({ type: [String], description: 'Permisos efectivos `recurso.accion`' })
  permissions!: string[];
}

/**
 * Respuesta de login, refresh y cambio de contraseña. El refresh token no
 * viaja aquí: va en la cookie HttpOnly `__Secure-refresh_token` (`refresh_token` en desarrollo).
 */
export class SessionResponseDto {
  @ApiProperty({ description: 'JWT de acceso. Guardarlo solo en memoria.' })
  accessToken!: string;

  @ApiProperty({ format: 'date-time', description: 'Caducidad del access token' })
  expiresAt!: string;

  @ApiProperty({
    description: 'La contraseña es inicial o caducó: la API rechaza todo salvo el cambio de contraseña (D13)',
  })
  passwordChangeRequired!: boolean;

  @ApiProperty({ type: SessionUserDto })
  user!: SessionUserDto;
}
