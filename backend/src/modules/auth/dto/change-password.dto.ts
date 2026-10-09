import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { MAX_PASSWORD_LENGTH } from '../password.service';

/**
 * La política de la nueva contraseña (longitud mínima, contraseñas comunes)
 * la aplica `PasswordService`, que devuelve todos los motivos a la vez. Aquí
 * solo se valida la forma.
 */
export class ChangePasswordDto {
  @ApiProperty({ format: 'password', minLength: 1, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @Length(1, MAX_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({ format: 'password', minLength: 1, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @Length(1, MAX_PASSWORD_LENGTH)
  newPassword!: string;
}
