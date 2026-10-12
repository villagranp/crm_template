import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCatalogReferencesRepository } from '@/infrastructure/database/prisma/repositories/prisma-catalog-references.repository';
import { PrismaCatalogsRepository } from '@/infrastructure/database/prisma/repositories/prisma-catalogs.repository';

import { CatalogLookupService } from './catalog-lookup.service';
import { CatalogReferenceValidator } from './catalog-reference.validator';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { CATALOG_REFERENCE_READER } from './ports/catalog-reference.port';
import { CATALOGS_REPOSITORY } from './ports/catalogs.repository.port';

/**
 * Catálogos (PLAN-ADMIN, D9). El puerto `CATALOGS_REPOSITORY` se enlaza aquí a
 * su adaptador Prisma; `CatalogsService` no conoce Prisma.
 *
 * Para RN-07.26 `CatalogsService` usa el puerto neutral
 * `PARAMETER_CATALOG_REFERENCES` (`common/ports`), que aporta
 * `ParametersCoreModule` (global). Este módulo no importa nada de `parameters`:
 * la dependencia va solo en un sentido (`parameters → catalogs`).
 *
 * Exporta `CatalogReferenceValidator` (00 §3.5): los módulos del CRM que escriben
 * columnas `*_id` hacia `catalog_items` importan este módulo y lo inyectan.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogsController],
  providers: [
    CatalogsService,
    CatalogLookupService,
    CatalogReferenceValidator,
    { provide: CATALOGS_REPOSITORY, useClass: PrismaCatalogsRepository },
    { provide: CATALOG_REFERENCE_READER, useClass: PrismaCatalogReferencesRepository },
  ],
  exports: [CatalogLookupService, CatalogReferenceValidator],
})
export class CatalogsModule {}
