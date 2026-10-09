import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaAuthRepository } from '@/infrastructure/database/prisma/repositories/prisma-auth.repository';

import { InitialCredentialService } from './initial-credential.service';
import { PasswordService } from './password.service';
import { AUTH_REPOSITORY } from './ports/auth.repository.port';

/**
 * Núcleo de credenciales: hashing, contraseña inicial y el puerto de datos.
 *
 * Va aparte de `AuthModule` porque `AccessModule` lo necesita para dar de alta
 * usuarios con credencial, y `AuthModule` a su vez necesita `AccessModule`
 * para resolver roles y permisos. Separarlo evita la dependencia circular.
 */
@Module({
  imports: [PrismaModule],
  providers: [PasswordService, InitialCredentialService, { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository }],
  exports: [PasswordService, InitialCredentialService, AUTH_REPOSITORY],
})
export class AuthCoreModule {}
