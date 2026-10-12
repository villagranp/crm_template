import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCatalogsRepository } from '@/infrastructure/database/prisma/repositories/prisma-catalogs.repository';

import { CatalogLookupService } from './catalog-lookup.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { CATALOGS_REPOSITORY } from './ports/catalogs.repository.port';

/**
 * Catálogos (PLAN-ADMIN, D9). El puerto `CATALOGS_REPOSITORY` se enlaza aquí a
 * su adaptador Prisma; `CatalogsService` no conoce Prisma.
 *
 * Para RN-07.26 `CatalogsService` usa el puerto neutral
 * `PARAMETER_CATALOG_REFERENCES` (`common/ports`), que aporta
 * `ParametersCoreModule` (global). Este módulo no importa nada de `parameters`:
 * la dependencia va solo en un sentido (`parameters → catalogs`).
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogsController],
  providers: [CatalogsService, CatalogLookupService, { provide: CATALOGS_REPOSITORY, useClass: PrismaCatalogsRepository }],
  exports: [CatalogLookupService],
})
export class CatalogsModule {}
