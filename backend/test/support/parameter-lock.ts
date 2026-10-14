import { PrismaClient } from '@prisma/client';

/**
 * Serializa entre archivos de prueba los cambios temporales de un parámetro
 * (`withParameter`). Las suites corren en paralelo sobre el mismo esquema: sin esto,
 * dos suites que cambian el mismo parámetro pueden leer como "original" el valor
 * temporal de la otra y dejarlo fijado al restaurar.
 *
 * Bloqueo consultivo de **sesión** (`pg_advisory_lock`) sobre un cliente propio con
 * una sola conexión, para que bloquear y liberar ocurran en la misma sesión.
 */
let client: PrismaClient | null = null;

function lockClient(): PrismaClient {
  if (!client) {
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('connection_limit', '1');
    client = new PrismaClient({ datasourceUrl: url.toString() });
  }
  return client;
}

export async function withParameterLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const db = lockClient();
  const lockKey = `test:parameter:${key}`;
  await db.$executeRaw`SELECT pg_advisory_lock(hashtext(${lockKey}))`;
  try {
    return await work();
  } finally {
    await db.$executeRaw`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
  }
}

/** Cierra la conexión del bloqueo (la llama `closeTestContext`). */
export async function disconnectParameterLock(): Promise<void> {
  const current = client;
  client = null;
  await current?.$disconnect();
}
