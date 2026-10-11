import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type {
  TransactionContext,
  TransactionOptions,
  TransactionRunner,
} from '@/infrastructure/database/ports/transaction.port';

import { PrismaService } from './prisma.service';

const DEFAULT_TIMEOUT_MS = 10_000;
/** Espera máxima de una conexión del pool antes de abrir la transacción. */
const MAX_WAIT_MS = 5_000;

/**
 * Único punto que convierte entre el handle opaco `TransactionContext` y el
 * cliente transaccional de Prisma. Solo lo usan los adaptadores de
 * `infrastructure/database/prisma/`.
 */
export function wrapPrismaTransaction(tx: Prisma.TransactionClient): TransactionContext {
  return tx as unknown as TransactionContext;
}

/** Cliente con el que debe operar un adaptador: el de la transacción del llamador o el global. */
export function prismaClientFor(prisma: PrismaService, tx: TransactionContext | undefined): Prisma.TransactionClient {
  return tx ? (tx as unknown as Prisma.TransactionClient) : prisma;
}

/** Adaptador Prisma de `TransactionRunner` (transacción interactiva). */
@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (tx: TransactionContext) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    return this.prisma.$transaction((tx) => work(wrapPrismaTransaction(tx)), {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxWait: MAX_WAIT_MS,
    });
  }
}
