import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCatalogsRepository } from '@/infrastructure/database/prisma/repositories/prisma-catalogs.repository';

import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { CATALOGS_REPOSITORY } from './ports/catalogs.repository.port';

/**
 * Catálogos (PLAN-ADMIN, D9). El puerto `CATALOGS_REPOSITORY` se enlaza aquí a
 * su adaptador Prisma; `CatalogsService` no conoce Prisma.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogsController],
  providers: [CatalogsService, { provide: CATALOGS_REPOSITORY, useClass: PrismaCatalogsRepository }],
})
export class CatalogsModule {}
