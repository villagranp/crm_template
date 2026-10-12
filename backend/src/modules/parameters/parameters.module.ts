import { Module } from '@nestjs/common';

import { AccessModule } from '@/modules/access/access.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';

import { ParametersController } from './parameters.controller';
import { ParametersService } from './parameters.service';

/**
 * Parámetros del sistema (PLAN-ADMIN, D10): la API de administración.
 * `AccessModule` aporta el usuario local de quien edita (`updatedById`); la
 * auditoría es global. `CatalogsModule` aporta `CatalogLookupService`
 * (referencias a códigos de catálogo, RN-07.30).
 *
 * `PARAMETERS_REPOSITORY` y `ParameterReader` vienen de `ParametersCoreModule`
 * (global, registrado en `AppModule`): un único enlace del repositorio.
 */
@Module({
  imports: [AccessModule, CatalogsModule],
  controllers: [ParametersController],
  providers: [ParametersService],
})
export class ParametersModule {}
