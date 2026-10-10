import { Module } from '@nestjs/common';

import { PrismaParametersRepository } from '@/infrastructure/database/prisma/repositories/prisma-parameters.repository';
import { AccessModule } from '@/modules/access/access.module';

import { ParametersController } from './parameters.controller';
import { ParametersService } from './parameters.service';
import { PARAMETERS_REPOSITORY } from './ports/parameters.repository.port';

/**
 * Parámetros del sistema (PLAN-ADMIN, D10). `AccessModule` aporta el usuario
 * local de quien edita (`updatedById`); la auditoría es global.
 */
@Module({
  imports: [AccessModule],
  controllers: [ParametersController],
  providers: [ParametersService, { provide: PARAMETERS_REPOSITORY, useClass: PrismaParametersRepository }],
})
export class ParametersModule {}
