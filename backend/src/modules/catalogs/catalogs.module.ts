import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCatalogsRepository } from '@/infrastructure/database/prisma/repositories/prisma-catalogs.repository';
import { PrismaParametersRepository } from '@/infrastructure/database/prisma/repositories/prisma-parameters.repository';
import { PARAMETERS_REPOSITORY } from '@/modules/parameters/ports/parameters.repository.port';

import { CatalogLookupService } from './catalog-lookup.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { CATALOGS_REPOSITORY } from './ports/catalogs.repository.port';

/**
 * Catálogos (PLAN-ADMIN, D9). El puerto `CATALOGS_REPOSITORY` se enlaza aquí a
 * su adaptador Prisma; `CatalogsService` no conoce Prisma.
 *
 * `PARAMETERS_REPOSITORY` se enlaza aquí (solo lectura) para impedir desactivar un
 * código que usa un parámetro (RN-07.26) sin importar `ParametersModule`, que a su
 * vez importa este módulo por `CatalogLookupService`: así no hay ciclo.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogsController],
  providers: [
    CatalogsService,
    CatalogLookupService,
    { provide: CATALOGS_REPOSITORY, useClass: PrismaCatalogsRepository },
    { provide: PARAMETERS_REPOSITORY, useClass: PrismaParametersRepository },
  ],
  exports: [CatalogLookupService],
})
export class CatalogsModule {}
