import { Module } from '@nestjs/common';

import { PrismaExchangeRateReaderRepository } from '@/infrastructure/database/prisma/repositories/prisma-exchange-rate-reader.repository';
import { PrismaExchangeRatesRepository } from '@/infrastructure/database/prisma/repositories/prisma-exchange-rates.repository';
import { AccessModule } from '@/modules/access/access.module';

import { CurrencyConversionService } from './currency-conversion.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { EXCHANGE_RATE_READER } from './ports/exchange-rate.reader.port';
import { EXCHANGE_RATE_REPOSITORY } from './ports/exchange-rate.repository.port';

/**
 * Monedas y tipos de cambio (ADR-024, 00 §2.16 y §11).
 *
 * - Lectura transversal: los módulos que estiman montos (Proyectos/oportunidades) o
 *   muestran la moneda local de referencia (Reportes) importan este módulo e
 *   inyectan `CurrencyConversionService` (puerto `ExchangeRateReader`).
 * - Mantenimiento (Módulo 7, 07 F.7, RN-07.44): `ExchangeRateRepository` de escritura
 *   y las rutas `/exchange-rates` y `/currencies`, aquí mismo porque la Fase 0 ya
 *   ubicó el lector en este módulo (07 §L). `AccessModule` aporta el usuario local de
 *   quien escribe; la auditoría y `ParameterReader` son globales.
 */
@Module({
  imports: [AccessModule],
  controllers: [ExchangeRatesController],
  providers: [
    CurrencyConversionService,
    ExchangeRatesService,
    { provide: EXCHANGE_RATE_READER, useClass: PrismaExchangeRateReaderRepository },
    { provide: EXCHANGE_RATE_REPOSITORY, useClass: PrismaExchangeRatesRepository },
  ],
  exports: [CurrencyConversionService],
})
export class ExchangeRatesModule {}
