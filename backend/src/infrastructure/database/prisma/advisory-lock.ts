import type { Prisma } from '@prisma/client';

import type { PrismaService } from './prisma.service';

/**
 * Claves de los bloqueos consultivos de PostgreSQL (`pg_advisory_xact_lock`).
 *
 * Cada clave serializa un invariante que abarca varias filas y que ninguna
 * restricción de la base puede expresar: "queda al menos un administrador",
 * "la jerarquía no tiene ciclos". Comprobar y escribir dentro de la misma
 * transacción, tras tomar el bloqueo, cierra la carrera entre dos peticiones
 * que comprueban a la vez y escriben después.
 *
 * Son bloqueos de transacción: se liberan solos al confirmar o deshacer. No
 * requieren esquema ni migración. El texto se convierte en entero con
 * `hashtext`; una colisión con otra clave solo serializaría de más, nunca de
 * menos.
 */
export const ADVISORY_LOCK_KEYS = {
  /** PLAN-ADMIN D3: último administrador y autobloqueo. */
  adminInvariant: 'access:admin-invariant',
  /** PLAN-ADMIN D7: jerarquía de opciones de menú sin ciclos. */
  menuHierarchy: 'menu:hierarchy',
  /** PLAN-ADMIN D8: jerarquía de equipos sin ciclos. */
  teamsHierarchy: 'teams:hierarchy',
} as const;

export type AdvisoryLockKey = (typeof ADVISORY_LOCK_KEYS)[keyof typeof ADVISORY_LOCK_KEYS];

/**
 * Tiempo máximo de la transacción interactiva, incluida la espera del bloqueo.
 * Las secciones protegidas son unas pocas consultas cortas; el margen cubre la
 * cola de peticiones concurrentes sobre la misma clave.
 */
const LOCKED_TRANSACTION_TIMEOUT_MS = 15_000;
/** Espera máxima para obtener una conexión del pool antes de abrir la transacción. */
const LOCKED_TRANSACTION_MAX_WAIT_MS = 5_000;

/** Toma el bloqueo consultivo `key` dentro de la transacción `tx`. */
export async function acquireAdvisoryXactLock(tx: Prisma.TransactionClient, key: AdvisoryLockKey): Promise<void> {
  // Consulta parametrizada: la clave viaja como parámetro, nunca concatenada.
  // `$executeRaw` y no `$queryRaw`: la función devuelve `void`, que Prisma no deserializa.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Abre una transacción interactiva, toma el bloqueo `key` y ejecuta `work`
 * con el cliente de la transacción. Si `work` lanza, todo se deshace.
 */
export function withAdvisoryXactLock<T>(
  prisma: PrismaService,
  key: AdvisoryLockKey,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await acquireAdvisoryXactLock(tx, key);
      return work(tx);
    },
    { timeout: LOCKED_TRANSACTION_TIMEOUT_MS, maxWait: LOCKED_TRANSACTION_MAX_WAIT_MS },
  );
}
