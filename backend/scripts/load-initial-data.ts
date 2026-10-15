/**
 * Carga inicial de datos por scripts con plantilla (docs/implementation-plans/CARGA-INICIAL.md).
 *
 * Quien administra el sistema ejecuta, desde la raíz del repositorio:
 *   pnpm --filter @app/backend run load:data -- template projects --format xlsx --out ./plantillas
 *   pnpm --filter @app/backend run load:data -- validate projects --file ./proyectos.xlsx
 *   pnpm --filter @app/backend run load:data -- apply projects --file ./proyectos.xlsx --actor admin@example.invalid
 *
 * Entidades: projects, products (familias y productos en el mismo libro), safety-minutes.
 * `validate` no escribe nada y es lo que corre si se omite el subcomando; `apply` exige `--actor`
 * (administrador activo) y, con NODE_ENV=production, `--confirm-production`.
 *
 * Abre un contexto standalone de Nest (sin servidor HTTP: no expone nada por red) y usa los
 * servicios de aplicación existentes, así que se respetan invariantes, folios, unicidad y
 * auditoría. Toda la lógica está en `src/modules/initial-data-load/`; este archivo solo arranca.
 *
 * Nunca escribe contraseñas ni datos de las filas en la consola ni en los logs.
 */
import 'reflect-metadata';

// Alias `@/*` → `src/*` para ts-node, antes de cargar cualquier módulo de `src/`.
import '../prisma/seed/register-path-aliases';

async function main(): Promise<number> {
  // El arranque de Nest registra eventos informativos en stdout; en un script solo estorban.
  // Una variable LOG_LEVEL definida en el shell tiene prioridad.
  process.env['LOG_LEVEL'] ??= 'warn';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { InitialDataLoader } = await import('../src/modules/initial-data-load/initial-data-loader.service');
  const { EXIT_UNEXPECTED, runCli } = await import('../src/modules/initial-data-load/cli/load-initial-data.cli');

  try {
    return await runCli(process.argv.slice(2), {
      env: process.env,
      cwd: process.cwd(),
      now: () => new Date(),
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`),
      open: async () => {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
        return { loader: app.get(InitialDataLoader), close: () => app.close() };
      },
    });
  } catch (error) {
    // Solo el nombre del error: su mensaje podría contener datos de una fila.
    process.stderr.write(`Error inesperado (${error instanceof Error ? error.name : 'desconocido'}). No se mostró más detalle para no exponer datos.\n`);
    return EXIT_UNEXPECTED;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    process.stderr.write('Error inesperado al iniciar la carga.\n');
    process.exitCode = 3;
  });
