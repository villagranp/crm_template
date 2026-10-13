/**
 * Purga de retención de la carga masiva (06 RN-06.29, D-06.12, DM-28).
 *
 * Sustituye por `{}` el `raw_data` de las filas de las cargas cerradas (o
 * creadas y nunca cerradas) hace más de `crm.importaciones.dias_retencion_filas`
 * días (90 por defecto). Conserva el registro de la carga, sus contadores y las
 * incidencias de cada fila (no contienen valores). Idempotente: una fila ya
 * purgada no se vuelve a tocar.
 *
 * Ejecutar (lo programa la operación del entorno, p. ej. una vez al día):
 *   pnpm --filter @app/backend run imports:purge-rows
 *
 * Usa el mismo caso de uso que la aplicación (`CustomerImportsService`), con el
 * parámetro validado por su regla: no hay una segunda copia de la regla aquí.
 * Escribe una línea JSON con el número de filas purgadas (sin datos personales).
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { CustomerImportsService } from '@/modules/customer-imports/customer-imports.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(CustomerImportsService).purgeExpiredRowData();
    process.stdout.write(`${JSON.stringify({ event: 'customer_import_rows_purged', purgedRows: result.purgedRows, before: result.before.toISOString() })}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: 'customer_import_rows_purge_failed', errorName: error instanceof Error ? error.name : 'UnknownError' })}\n`);
  process.exitCode = 1;
});
