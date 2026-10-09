import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaAccessRepository } from '@/infrastructure/database/prisma/repositories/prisma-access.repository';
import { AuthCoreModule } from '@/modules/auth/auth-core.module';

import { AccessService } from './access.service';
import { MeController } from './me.controller';
import { MenuOptionsController } from './menu-options.controller';
import { ACCESS_REPOSITORY } from './ports/access.repository.port';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Módulo de acceso: identidad local, autorización y opciones de menú.
 *
 * Exporta `AccessService` porque el resolutor de permisos global lo necesita
 * (ver `AuthenticationModule`). El puerto `ACCESS_REPOSITORY` se enlaza aquí a
 * su adaptador Prisma; ningún servicio de este módulo importa Prisma.
 */
@Module({
  imports: [PrismaModule, AuthCoreModule],
  controllers: [MeController, UsersController, RolesController, MenuOptionsController],
  providers: [
    AccessService,
    UsersService,
    RolesService,
    { provide: ACCESS_REPOSITORY, useClass: PrismaAccessRepository },
  ],
  exports: [AccessService],
})
export class AccessModule {}
