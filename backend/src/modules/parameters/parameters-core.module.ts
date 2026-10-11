import { Global, Module } from '@nestjs/common';

import { PARAMETER_CATALOG_REFERENCES } from '@/common/ports/parameter-catalog-references.port';
import { PrismaParametersRepository } from '@/infrastructure/database/prisma/repositories/prisma-parameters.repository';

import { ParameterCatalogReferencesService } from './parameter-catalog-references.service';
import { ParameterReader } from './parameter-reader';
import { PARAMETERS_REPOSITORY } from './ports/parameters.repository.port';

/**
 * Núcleo transversal de parámetros (00 §11), global como `AuditModule`:
 *
 * - **Único** enlace de `PARAMETERS_REPOSITORY` a su adaptador Prisma.
 * - `ParameterReader`: lectura validada para cualquier módulo (02 F.6.5, 07 F.9).
 * - `PARAMETER_CATALOG_REFERENCES` (puerto neutral en `common/ports`): lo consume
 *   `CatalogsModule` para RN-07.26 sin importar nada de `parameters`.
 *
 * No depende de ningún módulo funcional (solo de Prisma y del logger, globales),
 * así que `ParametersModule → CatalogsModule` no forma ciclo.
 */
@Global()
@Module({
  providers: [
    ParameterReader,
    ParameterCatalogReferencesService,
    { provide: PARAMETERS_REPOSITORY, useClass: PrismaParametersRepository },
    { provide: PARAMETER_CATALOG_REFERENCES, useExisting: ParameterCatalogReferencesService },
  ],
  exports: [ParameterReader, PARAMETERS_REPOSITORY, PARAMETER_CATALOG_REFERENCES],
})
export class ParametersCoreModule {}
