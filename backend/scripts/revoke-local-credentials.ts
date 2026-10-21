/**
 * Revoca las credenciales locales y las sesiones de las cuentas ya vinculadas con Microsoft Entra ID,
 * tras el corte directo (ADR-027, AUTHENTICATION.md §Runbook de corte). Desde la raíz del repositorio:
 *
 *   pnpm --filter @app/backend run auth:revoke-local -- validate
 *   pnpm --filter @app/backend run auth:revoke-local -- apply --confirm --actor admin@example.invalid
 *
 * `validate` no escribe nada y es lo que corre si se omite el subcomando. `apply` exige `--confirm`,
 * `--actor` (administrador activo) y AUTH_PROVIDER=entra en el entorno de esta ejecución. Solo se
 * tocan las cuentas con vínculo ENTRA_ID y las eliminadas; las demás se listan por id y se dejan intactas. Por defecto
 * aborta si queda alguna cuenta ACTIVE/INVITED sin vincular (`--allow-unlinked` lo omite) y el actor debe estar
 * vinculado por Entra ID.
 *
 * Abre un contexto standalone de Nest (sin servidor HTTP). Toda la lógica está en
 * `src/modules/identity-cutover/`; este archivo solo arranca. Nunca escribe contraseñas, correos ni
 * datos personales en la consola ni en el informe: solo ids internos y conteos.
 */
import 'reflect-metadata';

// Alias `@/*` → `src/*` para ts-node, antes de cargar cualquier módulo de `src/`.
import '../prisma/seed/register-path-aliases';

async function main(): Promise<number> {
  // El arranque de Nest registra eventos informativos en stdout; en un script solo estorban.
  process.env['LOG_LEVEL'] ??= 'warn';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { LocalCredentialRevocationService } = await import('../src/modules/identity-cutover/local-credential-revocation.service');
  const { EXIT_UNEXPECTED, runCli } = await import('../src/modules/identity-cutover/cli/revoke-local-credentials.cli');

  try {
    return await runCli(process.argv.slice(2), {
      cwd: process.cwd(),
      now: () => new Date(),
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`),
      open: async () => {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
        return { service: app.get(LocalCredentialRevocationService), close: () => app.close() };
      },
    });
  } catch (error) {
    // Solo el nombre del error: su mensaje podría contener datos.
    process.stderr.write(`Error inesperado (${error instanceof Error ? error.name : 'desconocido'}). No se mostró más detalle para no exponer datos.\n`);
    return EXIT_UNEXPECTED;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    process.stderr.write('Error inesperado al iniciar la revocación.\n');
    process.exitCode = 3;
  });
