import { Prisma } from '@prisma/client';

import { reportTimeoutError } from '@/modules/commercial-metrics/commercial-metrics-errors';

import type { PrismaService } from './prisma.service';

/** `statement_timeout` de las pantallas de Inicio y Reportes (05 D.3). */
export const SCREEN_STATEMENT_TIMEOUT_MS = 10_000;
/** `statement_timeout` de la exportación (05 D.3); lo usará la exportación XLSX (F-39). */
export const EXPORT_STATEMENT_TIMEOUT_MS = 60_000;
/** Espera máxima de una conexión del pool antes de abrir la transacción. */
const MAX_WAIT_MS = 5_000;
/** Margen de la transacción sobre el `statement_timeout`: varias consultas cortas caben dentro. */
const TRANSACTION_MARGIN_MS = 5_000;

/** SQLSTATE `query_canceled` (PostgreSQL), con el que termina una sentencia por `statement_timeout`. */
const QUERY_CANCELED = '57014';
/** Prisma: la transacción interactiva expiró o no pudo empezar a tiempo. */
const TRANSACTION_API_ERROR = 'P2028';

/** ¿El error es un vencimiento de tiempo de la consulta o de su transacción de lectura? */
export function isReadTimeout(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === TRANSACTION_API_ERROR) return true;
    if (error.meta?.['code'] === QUERY_CANCELED) return true;
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes(QUERY_CANCELED) || /canceling statement due to statement timeout/i.test(message);
}

/**
 * Ejecuta las lecturas de un indicador o reporte en **una** transacción
 * `REPEATABLE READ READ ONLY` con `SET LOCAL statement_timeout` (05 D.3): la página y
 * su conteo ven la misma instantánea y ninguna sentencia puede escribir. Un vencimiento
 * se traduce a `503 REPORT_TIMEOUT` (05 F.5); el resto de errores se propaga tal cual.
 *
 * Solo para adaptadores de `infrastructure/database/prisma/` (ADR-004).
 */
export async function runReportRead<T>(
  prisma: PrismaService,
  work: (db: Prisma.TransactionClient) => Promise<T>,
  statementTimeoutMs: number = SCREEN_STATEMENT_TIMEOUT_MS,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // `set_config(…, true)` = `SET LOCAL`, con el valor como parámetro enlazado.
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(statementTimeoutMs)}, true)`;
        return work(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: statementTimeoutMs + TRANSACTION_MARGIN_MS,
        maxWait: MAX_WAIT_MS,
      },
    );
  } catch (error) {
    if (isReadTimeout(error)) throw reportTimeoutError();
    throw error;
  }
}
