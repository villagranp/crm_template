import { Module } from '@nestjs/common';

import { PrismaExchangeRateReaderRepository } from '@/infrastructure/database/prisma/repositories/prisma-exchange-rate-reader.repository';

import { CurrencyConversionService } from './currency-conversion.service';
import { EXCHANGE_RATE_READER } from './ports/exchange-rate.reader.port';

/**
 * Monedas y tipos de cambio (ADR-024, 00 §2.16 y §11). Pieza transversal de solo
 * lectura: los módulos que estiman montos (Proyectos/oportunidades) o muestran la
 * moneda local de referencia (Reportes) importan este módulo e inyectan
 * `CurrencyConversionService`.
 *
 * `ParameterReader` llega de `ParametersCoreModule` (global). El mantenimiento de
 * tasas (`ExchangeRateRepository`, controladores `/exchange-rates` y `/currencies`)
 * lo añade el Módulo 7 aquí mismo (07 §L, F.7).
 */
@Module({
  providers: [CurrencyConversionService, { provide: EXCHANGE_RATE_READER, useClass: PrismaExchangeRateReaderRepository }],
  exports: [CurrencyConversionService],
})
export class ExchangeRatesModule {}
