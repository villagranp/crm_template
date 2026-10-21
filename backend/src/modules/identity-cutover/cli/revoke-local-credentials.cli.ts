import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildCutoverCsv,
  type CutoverReport,
  CutoverRejectedError,
  formatCutoverSummary,
  type LocalCredentialRevocationService,
} from '../local-credential-revocation.service';

/**
 * Línea de comandos de la revocación de credenciales locales tras el corte a Entra ID (ADR-027,
 * `backend/scripts/revoke-local-credentials.ts`):
 *
 *   revoke-local-credentials validate [--actor <correo|código>] [--report <ruta.csv>]
 *   revoke-local-credentials apply --confirm --actor <correo|código> [--allow-unlinked] [--report <ruta.csv>]
 *
 * `validate` no escribe nada y es lo que ocurre si se omite el subcomando. `apply` exige `--confirm`,
 * `--actor` (administrador activo **vinculado por Entra ID**) y `AUTH_PROVIDER=entra`, y **aborta sin tocar nada
 * si queda alguna cuenta ACTIVE/INVITED sin vincular** salvo que se pase `--allow-unlinked`. Códigos de
 * salida: 0 sin problemas; 1 abortado por cuentas sin vincular; 2 uso, actor o entorno rechazados; 3 error
 * inesperado; 4 la revocación SÍ se aplicó pero no se pudo escribir el informe.
 * Nunca escribe correos, nombres ni códigos de colaborador: solo ids internos y conteos.
 */

export const EXIT_OK = 0;
export const EXIT_ABORTED = 1;
export const EXIT_REJECTED = 2;
export const EXIT_UNEXPECTED = 3;
/** La revocación se aplicó, pero el informe no se pudo escribir: no es un rechazo, no hay que repetir nada. */
export const EXIT_APPLIED_REPORT_FAILED = 4;

export type CutoverCommand =
  | { readonly kind: 'help' }
  | {
      readonly kind: 'validate';
      readonly actor: string | null;
      readonly report: string | null;
    }
  | {
      readonly kind: 'apply';
      readonly actor: string;
      readonly report: string | null;
      /** Por defecto `true`: aborta si queda alguna cuenta ACTIVE/INVITED sin vincular. */
      readonly requireAllLinked: boolean;
    };

export type ParseResult = { readonly ok: true; readonly command: CutoverCommand } | { readonly ok: false; readonly message: string };

const VALUE_OPTIONS = ['--actor', '--report'] as const;
const FLAG_OPTIONS = ['--confirm', '--require-all-linked', '--allow-unlinked', '--help'] as const;

export const USAGE = [
  'Revoca las credenciales locales y las sesiones de las cuentas ya vinculadas con Entra ID (ADR-027).',
  '',
  'Uso:',
  '  pnpm --filter @app/backend run auth:revoke-local -- validate [--actor <correo|codigo>] [--report <ruta.csv>]',
  '  pnpm --filter @app/backend run auth:revoke-local -- apply --confirm --actor <correo|codigo> [--allow-unlinked] [--report <ruta.csv>]',
  '',
  '  validate no escribe nada (es lo que se ejecuta si se omite el subcomando).',
  '  apply exige --confirm, --actor (administrador activo y vinculado con Entra ID) y AUTH_PROVIDER=entra.',
  '  Se tocan las cuentas con vínculo ENTRA_ID y las eliminadas; las demás se cuentan y se listan por id.',
  '  Por defecto aborta sin tocar nada si queda alguna cuenta ACTIVE o INVITED sin vincular;',
  '  --allow-unlinked lo omite (esas cuentas conservan su credencial local, inactiva con AUTH_PROVIDER=entra).',
  '  (--require-all-linked sigue aceptándose: es el comportamiento por defecto.)',
  '',
  'Códigos de salida: 0 sin problemas; 1 abortado por cuentas sin vincular; 2 uso, actor o entorno rechazados; 3 error inesperado; 4 revocación aplicada pero informe no escrito.',
];

export function parseArgs(argv: readonly string[]): ParseResult {
  const tokens = argv.filter((token, index) => !(token === '--' && index === 0));
  const options = new Map<string, string | true>();
  const positional: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as string;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    if ((FLAG_OPTIONS as readonly string[]).includes(name)) {
      if (equals !== -1) return { ok: false, message: `La opción ${name} no recibe valor.` };
      options.set(name, true);
      continue;
    }
    if (!(VALUE_OPTIONS as readonly string[]).includes(name)) return { ok: false, message: `Opción desconocida: ${name.slice(0, 40)}.` };
    if (options.has(name)) return { ok: false, message: `La opción ${name} está repetida.` };
    let value: string | undefined;
    if (equals !== -1) value = token.slice(equals + 1);
    else {
      value = tokens[index + 1];
      index += 1;
    }
    if (value === undefined || value === '' || value.startsWith('--')) return { ok: false, message: `La opción ${name} necesita un valor.` };
    options.set(name, value);
  }

  if (options.has('--help') || positional[0] === 'help') return { ok: true, command: { kind: 'help' } };

  const first = positional[0];
  const explicit = first === 'validate' || first === 'apply';
  const kind = explicit ? first : 'validate';
  const extra = positional.slice(explicit ? 1 : 0);
  if (extra.length > 0) return { ok: false, message: 'Sobran argumentos: los valores de las opciones van con su opción (--actor <valor>).' };

  const text = (name: string): string | null => {
    const value = options.get(name);
    return typeof value === 'string' ? value : null;
  };

  if (kind === 'validate') {
    for (const name of ['--confirm', '--require-all-linked', '--allow-unlinked']) {
      if (options.has(name)) return { ok: false, message: `La opción ${name} solo aplica a apply.` };
    }
    return { ok: true, command: { kind: 'validate', actor: text('--actor'), report: text('--report') } };
  }

  const actor = text('--actor');
  if (!actor) return { ok: false, message: 'apply exige --actor <correo o código de colaborador> de un administrador activo.' };
  if (options.get('--confirm') !== true) return { ok: false, message: 'apply borra credenciales: exige --confirm.' };
  if (options.has('--require-all-linked') && options.has('--allow-unlinked')) {
    return { ok: false, message: '--require-all-linked y --allow-unlinked se contradicen: --require-all-linked es el comportamiento por defecto.' };
  }
  return { ok: true, command: { kind: 'apply', actor, report: text('--report'), requireAllLinked: options.get('--allow-unlinked') !== true } };
}

function stamp(at: Date): string {
  return at.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18);
}

export interface CliContext {
  readonly service: Pick<LocalCredentialRevocationService, 'validate' | 'apply' | 'authProvider'>;
  close(): Promise<void>;
}

export interface CliDeps {
  readonly cwd: string;
  readonly now: () => Date;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly open: () => Promise<CliContext>;
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.err(`Error: ${parsed.message}`);
    deps.err('Use --help para ver el uso.');
    return EXIT_REJECTED;
  }
  const { command } = parsed;
  if (command.kind === 'help') {
    USAGE.forEach((line) => deps.out(line));
    return EXIT_OK;
  }

  const context = await deps.open();
  try {
    const report: CutoverReport =
      command.kind === 'apply'
        ? await context.service.apply(command.actor, { requireAllLinked: command.requireAllLinked }, deps.now())
        : await context.service.validate(command.actor ?? undefined, deps.now());
    formatCutoverSummary(report, context.service.authProvider).forEach((line) => deps.out(line));

    if (report.rows.length > 0) {
      const path = resolve(deps.cwd, command.report ?? `informe-revocacion-credenciales-${command.kind}-${stamp(deps.now())}.csv`);
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, buildCutoverCsv(report), { flag: 'wx' });
        deps.out(`Informe por cuenta (solo ids internos): ${path}`);
      } catch {
        if (report.applied) {
          deps.err(`AVISO: la revocación SÍ se aplicó (no repita el comando para "arreglarlo"), pero no se pudo escribir el informe en ${path} (¿ya existe?). Los conteos están arriba; repita con \`validate --report <otra ruta>\` si necesita el detalle por cuenta.`);
          return EXIT_APPLIED_REPORT_FAILED;
        }
        deps.err(`No se pudo escribir el informe en ${path} (¿ya existe?). Use --report con otra ruta.`);
        return EXIT_REJECTED;
      }
    }
    return report.aborted ? EXIT_ABORTED : EXIT_OK;
  } catch (error) {
    if (error instanceof CutoverRejectedError) {
      deps.err(`Error: ${error.message} No se revocó nada.`);
      return EXIT_REJECTED;
    }
    throw error;
  } finally {
    await context.close();
  }
}
