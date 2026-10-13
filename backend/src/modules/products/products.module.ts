import { Module } from '@nestjs/common';

import { PrismaProductCatalogRepository } from '@/infrastructure/database/prisma/repositories/prisma-product-catalog.repository';
import { UnitConversionsModule } from '@/modules/unit-conversions/unit-conversions.module';

import { PRODUCT_CATALOG_READER } from './ports/product-catalog.reader.port';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Maestro de productos, familias, unidades y vista previa de conversión, en
 * **solo lectura** (03 F.4, §L.1). Las escrituras son del Módulo 7 (DM-23).
 * Exporta `ProductsService` para que Proyectos valide productos y unidades.
 */
@Module({
  imports: [UnitConversionsModule],
  controllers: [ProductsController],
  providers: [ProductsService, { provide: PRODUCT_CATALOG_READER, useClass: PrismaProductCatalogRepository }],
  exports: [ProductsService],
})
export class ProductsModule {}
