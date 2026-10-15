import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaAccessRepository } from '@/infrastructure/database/prisma/repositories/prisma-access.repository';
import { PrismaUserPreferencesRepository } from '@/infrastructure/database/prisma/repositories/prisma-user-preferences.repository';
import { PrismaVisibilityScopeRepository } from '@/infrastructure/database/prisma/repositories/prisma-visibility-scope.repository';
import { AuthCoreModule } from '@/modules/auth/auth-core.module';

import { AccessService } from './access.service';
import { MeController } from './me.controller';
import { MenuOptionsController } from './menu-options.controller';
import { MenuOptionsService } from './menu-options.service';
import { ACCESS_REPOSITORY } from './ports/access.repository.port';
import { USER_PREFERENCES_REPOSITORY } from './ports/user-preferences.repository.port';
import { VISIBILITY_SCOPE_READER } from './ports/visibility-scope.port';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { UiSettingsService } from './ui-settings.service';
import { UserPreferencesService } from './user-preferences.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { VisibilityScopeResolver } from './visibility-scope.resolver';

/**
 * Módulo de acceso: identidad local, autorización y opciones de menú.
 *
 * Exporta `AccessService` porque el resolutor de permisos global lo necesita
 * (ver `AuthenticationModule`). El puerto `ACCESS_REPOSITORY` se enlaza aquí a
 * su adaptador Prisma; ningún servicio de este módulo importa Prisma.
 *
 * Exporta también `VisibilityScopeResolver` (00 §4.2): los módulos del CRM lo
 * inyectan para obtener el alcance de datos del usuario y filtran con él en sus
 * repositorios.
 */
@Module({
  imports: [PrismaModule, AuthCoreModule],
  controllers: [MeController, UsersController, RolesController, MenuOptionsController],
  providers: [
    AccessService,
    UsersService,
    RolesService,
    MenuOptionsService,
    VisibilityScopeResolver,
    UserPreferencesService,
    UiSettingsService,
    { provide: USER_PREFERENCES_REPOSITORY, useClass: PrismaUserPreferencesRepository },
    { provide: ACCESS_REPOSITORY, useClass: PrismaAccessRepository },
    { provide: VISIBILITY_SCOPE_READER, useClass: PrismaVisibilityScopeRepository },
  ],
  exports: [AccessService, VisibilityScopeResolver],
})
export class AccessModule {}
