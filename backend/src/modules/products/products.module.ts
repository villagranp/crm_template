import { Module } from '@nestjs/common';

import { PrismaProductCatalogRepository } from '@/infrastructure/database/prisma/repositories/prisma-product-catalog.repository';
import { PrismaProductMastersRepository } from '@/infrastructure/database/prisma/repositories/prisma-product-masters.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';
import { UnitConversionsModule } from '@/modules/unit-conversions/unit-conversions.module';

import { PRODUCT_CATALOG_READER } from './ports/product-catalog.reader.port';
import { PRODUCT_MASTERS_REPOSITORY } from './ports/product-masters.repository.port';
import { ProductFamiliesController } from './product-families.controller';
import { ProductMastersService } from './product-masters.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { UnitConversionRulesController } from './unit-conversion-rules.controller';
import { UnitConversionRulesService } from './unit-conversion-rules.service';
import { UnitsOfMeasureController } from './units-of-measure.controller';

/**
 * Maestros comerciales: productos, familias, unidades y reglas de conversión.
 *
 * - Lectura (03 F.4, §L.1): `ProductsService` (exportado para que Proyectos valide
 *   productos y unidades) sobre `ProductCatalogReader`, y la vista previa de conversión.
 * - Mantenimiento (Módulo 7, 07 F.7, D-07.9, DM-23): `ProductMastersService` y
 *   `UnitConversionRulesService` sobre `ProductMastersRepository`. Se ubica aquí, y no
 *   en un módulo `crm-masters` aparte, porque las rutas de colección (`/products`,
 *   `/product-families`, `/units-of-measure`) ya las sirve este módulo para el Módulo 3:
 *   un segundo módulo partiría cada recurso REST entre dos dueños y obligaría a duplicar
 *   o mover las lecturas (07 F.7: "este módulo añade solo la escritura y reutiliza su puerto").
 *
 * `AccessModule` aporta el usuario local de quien escribe; `CatalogsModule`, la guardia
 * de `crm.tipo_proyecto` (00 §3.5); `UnitConversionsModule`, la unidad de tonelaje. La
 * auditoría y `ParameterReader` son globales.
 */
@Module({
  imports: [UnitConversionsModule, AccessModule, CatalogsModule],
  controllers: [ProductsController, ProductFamiliesController, UnitsOfMeasureController, UnitConversionRulesController],
  providers: [
    ProductsService,
    ProductMastersService,
    UnitConversionRulesService,
    { provide: PRODUCT_CATALOG_READER, useClass: PrismaProductCatalogRepository },
    { provide: PRODUCT_MASTERS_REPOSITORY, useClass: PrismaProductMastersRepository },
  ],
  exports: [ProductsService, ProductMastersService],
})
export class ProductsModule {}
