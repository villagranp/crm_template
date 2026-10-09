import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH } from '../password.service';

export class LoginDto {
  @ApiProperty({ example: 'persona@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /**
   * Sin longitud mínima: la política se exige al fijar la contraseña, no al
   * entrar. El tope evita gastar CPU de Argon2 en entradas enormes.
   */
  @ApiProperty({ format: 'password', minLength: 1, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @Length(1, MAX_PASSWORD_LENGTH)
  password!: string;
}
