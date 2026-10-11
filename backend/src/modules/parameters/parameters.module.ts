import { Module } from '@nestjs/common';

import { PrismaParametersRepository } from '@/infrastructure/database/prisma/repositories/prisma-parameters.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';

import { ParameterReader } from './parameter-reader';

import { ParametersController } from './parameters.controller';
import { ParametersService } from './parameters.service';
import { PARAMETERS_REPOSITORY } from './ports/parameters.repository.port';

/**
 * Parámetros del sistema (PLAN-ADMIN, D10). `AccessModule` aporta el usuario
 * local de quien edita (`updatedById`); la auditoría es global. `CatalogsModule`
 * aporta `CatalogLookupService` (referencias a códigos de catálogo, RN-07.30).
 * Exporta `ParameterReader` para el resto de módulos (02 F.6.5, 07 F.9).
 */
@Module({
  imports: [AccessModule, CatalogsModule],
  controllers: [ParametersController],
  providers: [ParametersService, ParameterReader, { provide: PARAMETERS_REPOSITORY, useClass: PrismaParametersRepository }],
  exports: [ParameterReader],
})
export class ParametersModule {}
