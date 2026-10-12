import { Global, Module } from '@nestjs/common';

import { SEQUENCE_GENERATOR } from '@/infrastructure/database/ports/sequence-generator.port';
import { TRANSACTION_RUNNER } from '@/infrastructure/database/ports/transaction.port';

import { PrismaSequenceGenerator } from './prisma-sequence-generator';
import { PrismaService } from './prisma.service';
import { PrismaTransactionRunner } from './prisma-transaction';

/**
 * Cliente Prisma y piezas transversales de datos (00 §11). Global: cualquier
 * módulo inyecta `TRANSACTION_RUNNER` y `SEQUENCE_GENERATOR` por su token, sin
 * conocer el adaptador.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
    { provide: SEQUENCE_GENERATOR, useClass: PrismaSequenceGenerator },
  ],
  exports: [PrismaService, TRANSACTION_RUNNER, SEQUENCE_GENERATOR],
})
export class PrismaModule {}
