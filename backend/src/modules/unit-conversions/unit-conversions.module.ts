import { Module } from '@nestjs/common';

import { PrismaUnitConversionsRepository } from '@/infrastructure/database/prisma/repositories/prisma-unit-conversions.repository';

import { UNIT_CONVERSION_READER } from './ports/unit-conversion.reader.port';
import { UnitConversionResolver } from './unit-conversion.resolver';

/**
 * Conversión de unidades a la unidad de tonelaje (00 §2.3 y §11, 03 C.5). Pieza
 * transversal de solo lectura: la importan Proyectos (clasificación, productos
 * asociados, duplicado), Forecast, Productos (`GET /unit-conversions/resolve`) y
 * Parámetros (RN-07.33). `ParameterReader` llega de `ParametersCoreModule` (global).
 *
 * El mantenimiento de unidades y reglas es del Módulo 7 (DM-23, DM-24).
 */
@Module({
  providers: [UnitConversionResolver, { provide: UNIT_CONVERSION_READER, useClass: PrismaUnitConversionsRepository }],
  exports: [UnitConversionResolver],
})
export class UnitConversionsModule {}
