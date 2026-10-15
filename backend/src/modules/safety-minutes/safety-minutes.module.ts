import { Module } from '@nestjs/common';

import { PrismaSafetyMinutesRepository } from '@/infrastructure/database/prisma/repositories/prisma-safety-minutes.repository';
import { AccessModule } from '@/modules/access/access.module';
import { BUSINESS_CLOCK, systemBusinessClock } from '@/modules/commercial-metrics/business-clock';

import { MeSafetyMinuteController } from './me-safety-minute.controller';
import { SAFETY_MINUTE_REPOSITORY } from './ports/safety-minute.repository.port';
import { SafetyMinutesController } from './safety-minutes.controller';
import { SafetyMinutesService } from './safety-minutes.service';

/**
 * Minuto de seguridad (Ajustes 1, AJ1-2): mantenimiento (`/safety-minutes`, permisos
 * `minuto_seguridad.*`) y lectura del día para toda sesión (`/me/safety-minute`).
 * `AccessModule` aporta el usuario local de quien escribe; la auditoría y `ParameterReader`
 * (zona del negocio) son globales. El reloj es el del negocio, sustituible en pruebas.
 */
@Module({
  imports: [AccessModule],
  controllers: [SafetyMinutesController, MeSafetyMinuteController],
  providers: [
    SafetyMinutesService,
    { provide: BUSINESS_CLOCK, useValue: systemBusinessClock },
    { provide: SAFETY_MINUTE_REPOSITORY, useClass: PrismaSafetyMinutesRepository },
  ],
})
export class SafetyMinutesModule {}
