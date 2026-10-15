import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { LOAD_MAX_FILE_BYTES, type LoadFile, type LoadSource } from '../initial-data-file-reader';
import { ActorRejectedError, type InitialDataLoader } from '../initial-data-loader.service';
import { buildReportCsv, exitCodeOf, formatReportSummary, type LoadMode } from '../initial-data-report';
import { buildTemplateFiles, type TemplateFormat } from '../initial-data-template-files';
import { entityDefinition, INITIAL_DATA_ENTITIES, INITIAL_DATA_TEMPLATE_VERSION, type InitialDataEntity, isInitialDataEntity } from '../initial-data-templates';

/**
 * Línea de comandos de la carga inicial (`backend/scripts/load-initial-data.ts`):
 *
 *   load-initial-data template <entidad> [--format xlsx|csv] [--out <carpeta>]
 *   load-initial-data validate <entidad> --file <ruta> [--actor <correo|código>] [--report <ruta.csv>]
 *   load-initial-data apply    <entidad> --file <ruta> --actor <correo|código> [--report <ruta.csv>] [--confirm-production]
 *
 * `validate` no escribe nada en la base y es lo que ocurre si se omite el subcomando. Códigos de
 * salida: 0 sin errores; 1 errores de validación o de aplicación; 2 uso incorrecto, archivo,
 * actor o entorno rechazados; 3 error inesperado. Nunca escribe datos de las filas en la consola.
 */

export const EXIT_OK = 0;
export const EXIT_ERRORS = 1;
export const EXIT_REJECTED = 2;
export const EXIT_UNEXPECTED = 3;

export type CliCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'template'; readonly entity: InitialDataEntity; readonly format: TemplateFormat; readonly outDir: string | null; readonly force: boolean }
  | {
      readonly kind: LoadMode;
      readonly entity: InitialDataEntity;
      readonly file: string;
      readonly actor: string | null;
      readonly report: string | null;
      readonly confirmProduction: boolean;
    };

export type ParseResult = { readonly ok: true; readonly command: CliCommand } | { readonly ok: false; readonly message: string };

const VALUE_OPTIONS = ['--file', '--actor', '--report', '--format', '--out'] as const;
const FLAG_OPTIONS = ['--confirm-production', '--force', '--help'] as const;

export const USAGE = [
  'Carga inicial de datos por scripts (proyectos, productos y familias, minutos de seguridad).',
  '',
  'Uso:',
  '  pnpm --filter @app/backend run load:data -- template <entidad> [--format xlsx|csv] [--out <carpeta>] [--force]',
  '  pnpm --filter @app/backend run load:data -- validate <entidad> --file <ruta> [--actor <correo|codigo>] [--report <ruta.csv>]',
  '  pnpm --filter @app/backend run load:data -- apply <entidad> --file <ruta> --actor <correo|codigo> [--report <ruta.csv>] [--confirm-production]',
  '',
  `Entidades: ${INITIAL_DATA_ENTITIES.join(', ')}.`,
  '  validate no escribe nada (es lo que se ejecuta si se omite el subcomando).',
  '  template no sobrescribe plantillas existentes salvo con --force.',
  '  apply exige --actor: un usuario activo con rol de administrador y el permiso de la entidad.',
  '  Con NODE_ENV=production, apply exige además --confirm-production.',
  '  En CSV de productos, --file es el archivo de productos; el de familias es el mismo nombre con el sufijo -familias (opcional).',
  '',
  'Códigos de salida: 0 sin errores; 1 errores de validación o aplicación; 2 uso, archivo o actor rechazados; 3 error inesperado.',
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

  // Sin subcomando se valida (nunca se escribe por omisión).
  const first = positional[0];
  const explicit = first === 'template' || first === 'validate' || first === 'apply';
  const kind = explicit ? first : 'validate';
  const entityText = explicit ? positional[1] : first;
  const extra = positional.slice(explicit ? 2 : 1);
  if (!entityText) return { ok: false, message: 'Falta la entidad.' };
  if (!isInitialDataEntity(entityText)) return { ok: false, message: `Entidad desconocida. Use: ${INITIAL_DATA_ENTITIES.join(', ')}.` };
  if (extra.length > 0) return { ok: false, message: 'Sobran argumentos: los valores de las opciones van con su opción (--file <ruta>).' };

  const text = (name: string): string | null => {
    const value = options.get(name);
    return typeof value === 'string' ? value : null;
  };

  if (kind === 'template') {
    for (const name of ['--file', '--actor', '--report', '--confirm-production']) {
      if (options.has(name)) return { ok: false, message: `La opción ${name} no aplica a template.` };
    }
    const format = text('--format') ?? 'xlsx';
    if (format !== 'xlsx' && format !== 'csv') return { ok: false, message: '--format debe ser xlsx o csv.' };
    return {
      ok: true,
      command: { kind: 'template', entity: entityText, format: format === 'csv' ? 'CSV' : 'XLSX', outDir: text('--out'), force: options.get('--force') === true },
    };
  }

  for (const name of ['--format', '--out', '--force']) {
    if (options.has(name)) return { ok: false, message: `La opción ${name} solo aplica a template.` };
  }
  const file = text('--file');
  if (!file) return { ok: false, message: 'Falta --file <ruta>.' };
  const actor = text('--actor');
  if (kind === 'apply' && !actor) return { ok: false, message: 'apply exige --actor <correo o código de colaborador> de un administrador activo.' };
  if (kind === 'validate' && options.has('--confirm-production')) return { ok: false, message: '--confirm-production solo aplica a apply.' };
  return {
    ok: true,
    command: { kind, entity: entityText, file, actor, report: text('--report'), confirmProduction: options.get('--confirm-production') === true },
  };
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

export class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliInputError';
  }
}

async function readLimited(path: string): Promise<LoadFile> {
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new CliInputError(`El archivo no existe o no se puede leer: ${basename(path)}.`);
  }
  if (!info.isFile()) throw new CliInputError(`La ruta no es un archivo: ${basename(path)}.`);
  const extension = extname(path).toLowerCase();
  if (extension !== '.csv' && extension !== '.xlsx') throw new CliInputError('Solo se admiten archivos .csv y .xlsx.');
  if (info.size > LOAD_MAX_FILE_BYTES) throw new CliInputError(`El archivo supera el tamaño máximo de ${LOAD_MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  try {
    return { fileName: basename(path), buffer: await readFile(path) };
  } catch {
    throw new CliInputError(`No se pudo leer el archivo: ${basename(path)}.`);
  }
}

/** Valida la ruta (existe, extensión, tamaño) y arma el origen: el libro XLSX o los CSV hermanos. */
export async function resolveSource(entity: InitialDataEntity, filePath: string, cwd: string): Promise<LoadSource> {
  const path = resolve(cwd, filePath);
  const main = await readLimited(path);
  if (extname(path).toLowerCase() === '.xlsx') return { format: 'XLSX', file: main };

  const definition = entityDefinition(entity);
  const stem = basename(path, extname(path));
  const files: Partial<Record<(typeof definition.sheets)[number]['id'], LoadFile>> = {};
  for (const sheet of definition.sheets) {
    if (sheet.csvSuffix === '') {
      files[sheet.id] = main;
      continue;
    }
    if (stem.endsWith(sheet.csvSuffix)) {
      throw new CliInputError(`Pase el archivo principal (sin el sufijo ${sheet.csvSuffix}); el de ${sheet.sheetName} se busca junto a él.`);
    }
    try {
      files[sheet.id] = await readLimited(join(dirname(path), `${stem}${sheet.csvSuffix}.csv`));
    } catch (error) {
      // Una hoja CSV opcional puede faltar; si existe pero no es válida, se rechaza.
      if (error instanceof CliInputError && error.message.startsWith('El archivo no existe') && sheet.optionalInCsv) continue;
      throw error;
    }
  }
  return { format: 'CSV', files };
}

/** `host:puerto/base (esquema x)` de `DATABASE_URL`, sin usuario ni contraseña. */
export function describeDatabaseTarget(databaseUrl: string | undefined): string {
  if (!databaseUrl) return 'base de datos no configurada';
  try {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get('schema') ?? 'public';
    return `${url.hostname}:${url.port || '5432'}${url.pathname} (esquema ${schema})`;
  } catch {
    return 'base de datos (DATABASE_URL ilegible)';
  }
}

function stamp(at: Date): string {
  return at.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18);
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

/** Contexto de aplicación abierto por el script (en las pruebas, el de la app de pruebas). */
export interface CliContext {
  readonly loader: InitialDataLoader;
  close(): Promise<void>;
}

export interface CliDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
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

  if (command.kind === 'apply' && deps.env['NODE_ENV'] === 'production' && !command.confirmProduction) {
    deps.err('Error: NODE_ENV=production: apply exige --confirm-production. No se aplicó nada.');
    return EXIT_REJECTED;
  }

  let source: LoadSource | null = null;
  if (command.kind !== 'template') {
    try {
      source = await resolveSource(command.entity, command.file, deps.cwd);
    } catch (error) {
      if (error instanceof CliInputError) {
        deps.err(`Error: ${error.message}`);
        return EXIT_REJECTED;
      }
      throw error;
    }
  }

  const context = await deps.open();
  try {
    deps.out(`Base de datos: ${describeDatabaseTarget(deps.env['DATABASE_URL'])}`);
    if (command.kind === 'template') return await runTemplate(command, context.loader, deps);
    return await runLoad(command, source as LoadSource, context.loader, deps);
  } catch (error) {
    if (error instanceof ActorRejectedError) {
      deps.err(`Error: ${error.message} No se aplicó nada.`);
      return EXIT_REJECTED;
    }
    throw error;
  } finally {
    await context.close();
  }
}

async function runTemplate(command: Extract<CliCommand, { kind: 'template' }>, loader: InitialDataLoader, deps: CliDeps): Promise<number> {
  const values = await loader.templateValues();
  const files = await buildTemplateFiles(command.entity, command.format, values);
  const outDir = resolve(deps.cwd, command.outDir ?? '.');
  const existing: string[] = [];
  for (const file of files) {
    if (await stat(join(outDir, file.fileName)).then(() => true, () => false)) existing.push(file.fileName);
  }
  if (existing.length > 0 && !command.force) {
    deps.err(`Error: ya existe ${existing.join(', ')} en ${outDir}: no se sobrescribe. Use otra carpeta con --out o añada --force. No se escribió nada.`);
    return EXIT_REJECTED;
  }
  await mkdir(outDir, { recursive: true });
  for (const file of files) {
    await writeFile(join(outDir, file.fileName), file.content);
    deps.out(`Plantilla v${INITIAL_DATA_TEMPLATE_VERSION} escrita: ${join(outDir, file.fileName)}`);
  }
  return EXIT_OK;
}

async function runLoad(command: Extract<CliCommand, { kind: LoadMode }>, source: LoadSource, loader: InitialDataLoader, deps: CliDeps): Promise<number> {
  const report =
    command.kind === 'apply'
      ? await loader.apply(command.entity, source, command.actor as string)
      : await loader.validate(command.entity, source, command.actor ?? undefined);
  formatReportSummary(report).forEach((line) => deps.out(line));
  if (report.entries.length > 0) {
    const path = resolve(deps.cwd, command.report ?? `informe-carga-${command.entity}-${command.kind}-${stamp(deps.now())}.csv`);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buildReportCsv(report), { flag: 'wx' });
      deps.out(`Informe de errores y omitidos: ${path}`);
    } catch {
      deps.err(`No se pudo escribir el informe en ${path} (¿ya existe?). Use --report con otra ruta.${report.applied ? ' La carga ya se aplicó.' : ''}`);
      return EXIT_REJECTED;
    }
  }
  return exitCodeOf(report) === 0 ? EXIT_OK : EXIT_ERRORS;
}
