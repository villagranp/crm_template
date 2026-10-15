import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOAD_MAX_FILE_BYTES } from '../initial-data-file-reader';
import { ActorRejectedError, type InitialDataLoader } from '../initial-data-loader.service';
import { newReport } from '../initial-data-report';
import { ENTITY_DEFINITIONS } from '../initial-data-templates';
import {
  type CliDeps,
  CliInputError,
  describeDatabaseTarget,
  EXIT_ERRORS,
  EXIT_OK,
  EXIT_REJECTED,
  parseArgs,
  resolveSource,
  runCli,
} from './load-initial-data.cli';

describe('parseArgs', () => {
  const parse = (...argv: string[]) => parseArgs(argv);

  it('validate con --file; con o sin separador `--` que pnpm puede pasar', () => {
    expect(parse('validate', 'projects', '--file', 'a.xlsx')).toEqual({
      ok: true,
      command: { kind: 'validate', entity: 'projects', file: 'a.xlsx', actor: null, report: null, confirmProduction: false },
    });
    expect(parse('--', 'validate', 'products', '--file=a.csv', '--actor', 'x@example.invalid', '--report', 'r.csv')).toEqual({
      ok: true,
      command: { kind: 'validate', entity: 'products', file: 'a.csv', actor: 'x@example.invalid', report: 'r.csv', confirmProduction: false },
    });
  });

  it('sin subcomando se valida: nunca se escribe por omisión', () => {
    expect(parse('safety-minutes', '--file', 'a.csv')).toMatchObject({ ok: true, command: { kind: 'validate', entity: 'safety-minutes' } });
  });

  it('apply exige --actor y acepta --confirm-production', () => {
    expect(parse('apply', 'projects', '--file', 'a.xlsx')).toEqual({ ok: false, message: expect.stringContaining('--actor') });
    expect(parse('apply', 'projects', '--file', 'a.xlsx', '--actor', 'EMP-1', '--confirm-production')).toMatchObject({
      ok: true,
      command: { kind: 'apply', actor: 'EMP-1', confirmProduction: true },
    });
  });

  it('template acepta formato y carpeta y rechaza opciones de carga', () => {
    expect(parse('template', 'products')).toEqual({ ok: true, command: { kind: 'template', entity: 'products', format: 'XLSX', outDir: null, force: false } });
    expect(parse('template', 'products', '--format', 'csv', '--out', './p')).toEqual({ ok: true, command: { kind: 'template', entity: 'products', format: 'CSV', outDir: './p', force: false } });
    expect(parse('template', 'products', '--force')).toMatchObject({ ok: true, command: { force: true } });
    expect(parse('validate', 'products', '--file', 'a.csv', '--force')).toMatchObject({ ok: false });
    expect(parse('template', 'products', '--format', 'pdf')).toMatchObject({ ok: false });
    expect(parse('template', 'products', '--file', 'a.csv')).toMatchObject({ ok: false });
    expect(parse('validate', 'products', '--file', 'a.csv', '--out', 'x')).toMatchObject({ ok: false });
  });

  it.each([
    [['validate'], 'Falta la entidad'],
    [['validate', 'clientes', '--file', 'a.csv'], 'Entidad desconocida'],
    [['validate', 'projects'], 'Falta --file'],
    [['validate', 'projects', '--file'], 'necesita un valor'],
    [['validate', 'projects', '--file', '--actor', 'x'], 'necesita un valor'],
    [['validate', 'projects', '--file', 'a', '--file', 'b'], 'repetida'],
    [['validate', 'projects', '--file', 'a', '--bogus', 'b'], 'Opción desconocida'],
    [['validate', 'projects', 'otra', '--file', 'a'], 'Sobran argumentos'],
    [['validate', 'projects', '--file', 'a', '--confirm-production'], 'solo aplica a apply'],
    [['validate', 'projects', '--file', 'a', '--help=1'], 'no recibe valor'],
  ])('rechaza %j', (argv, fragment) => {
    const result = parseArgs(argv);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain(fragment);
  });

  it('--help y help muestran el uso', () => {
    expect(parse('--help')).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parse('help')).toEqual({ ok: true, command: { kind: 'help' } });
  });
});

describe('describeDatabaseTarget', () => {
  it('muestra servidor, base y esquema sin usuario ni contraseña', () => {
    const text = describeDatabaseTarget('postgresql://usuario:clave-secreta@db.example.invalid:5433/mi_base?schema=integration_x');
    expect(text).toBe('db.example.invalid:5433/mi_base (esquema integration_x)');
    expect(text).not.toMatch(/usuario|secreta/);
    expect(describeDatabaseTarget('postgresql://u:p@localhost/db')).toBe('localhost:5432/db (esquema public)');
    expect(describeDatabaseTarget(undefined)).toBe('base de datos no configurada');
    expect(describeDatabaseTarget('no-es-url')).toBe('base de datos (DATABASE_URL ilegible)');
  });
});

describe('resolveSource y runCli (con archivos temporales)', () => {
  let dir: string;
  const PRODUCT_HEADERS = ENTITY_DEFINITIONS.products.sheets[1]!.columns.map((column) => column.header).join(',');
  const FAMILY_HEADERS = ENTITY_DEFINITIONS.products.sheets[0]!.columns.map((column) => column.header).join(',');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'carga-inicial-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rechaza un archivo que no existe, una extensión no admitida, una carpeta y un archivo demasiado grande', async () => {
    await expect(resolveSource('projects', 'no-existe.csv', dir)).rejects.toBeInstanceOf(CliInputError);
    await writeFile(join(dir, 'a.txt'), 'x');
    await expect(resolveSource('projects', 'a.txt', dir)).rejects.toThrow('Solo se admiten archivos .csv y .xlsx.');
    await expect(resolveSource('projects', dir, dir)).rejects.toThrow('no es un archivo');
    await writeFile(join(dir, 'grande.csv'), Buffer.alloc(LOAD_MAX_FILE_BYTES + 1, 0x61));
    await expect(resolveSource('projects', 'grande.csv', dir)).rejects.toThrow('tamaño máximo');
  });

  it('un XLSX es un solo libro; un CSV de productos trae la hoja de familias de al lado si existe', async () => {
    await writeFile(join(dir, 'libro.xlsx'), 'contenido');
    expect(await resolveSource('products', 'libro.xlsx', dir)).toMatchObject({ format: 'XLSX', file: { fileName: 'libro.xlsx' } });

    await writeFile(join(dir, 'productos.csv'), PRODUCT_HEADERS);
    const without = await resolveSource('products', 'productos.csv', dir);
    expect(without).toMatchObject({ format: 'CSV' });
    expect(Object.keys((without as { files: object }).files)).toEqual(['products']);

    await writeFile(join(dir, 'productos-familias.csv'), FAMILY_HEADERS);
    const withFamilies = await resolveSource('products', 'productos.csv', dir);
    expect(Object.keys((withFamilies as { files: object }).files).sort()).toEqual(['families', 'products']);
    await expect(resolveSource('products', 'productos-familias.csv', dir)).rejects.toThrow('archivo principal');
  });

  function deps(overrides: Partial<CliDeps> & { loader?: Partial<InitialDataLoader> } = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const close = jest.fn(async () => undefined);
    const loader = (overrides.loader ?? {}) as InitialDataLoader;
    const value: CliDeps = {
      env: { DATABASE_URL: 'postgresql://u:clave@localhost:5432/db?schema=integration_x', ...overrides.env },
      cwd: dir,
      now: () => new Date('2030-01-02T03:04:05Z'),
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      open: overrides.open ?? (async () => ({ loader, close })),
    };
    return { value, out, err, close };
  }

  it('en producción apply exige --confirm-production y no abre la aplicación', async () => {
    await writeFile(join(dir, 'm.csv'), 'x');
    const open = jest.fn();
    const { value, err } = deps({ env: { NODE_ENV: 'production' }, open });
    expect(await runCli(['apply', 'safety-minutes', '--file', 'm.csv', '--actor', 'a@example.invalid'], value)).toBe(EXIT_REJECTED);
    expect(err.join('\n')).toContain('--confirm-production');
    expect(open).not.toHaveBeenCalled();
  });

  it('un uso incorrecto o un archivo inválido salen con 2 sin abrir la aplicación', async () => {
    const open = jest.fn();
    const { value, err } = deps({ open });
    expect(await runCli(['validate'], value)).toBe(EXIT_REJECTED);
    expect(await runCli(['validate', 'projects', '--file', 'no-existe.xlsx'], value)).toBe(EXIT_REJECTED);
    expect(err.join('\n')).toContain('Falta la entidad');
    expect(open).not.toHaveBeenCalled();
  });

  it('valida, imprime el resumen sin datos de filas, escribe el informe y sale con 1 si hay errores', async () => {
    await writeFile(join(dir, 'm.csv'), 'x');
    const report = newReport(
      'safety-minutes',
      'validate',
      [{ sheet: 'Minutos', read: 1, toCreate: 0, created: 0, exists: 0, existsDifferent: 0, createdWithWarning: 0, errors: 1 }],
      [{ sheet: 'Minutos', row: 2, column: 'Mensaje', status: 'ERROR', code: 'REQUIRED_FIELD_MISSING', message: 'El campo es obligatorio.' }],
      false,
    );
    const validate = jest.fn(async () => report);
    const { value, out, err, close } = deps({ loader: { validate } as unknown as Partial<InitialDataLoader> });
    expect(await runCli(['validate', 'safety-minutes', '--file', 'm.csv'], value)).toBe(EXIT_ERRORS);
    expect(validate).toHaveBeenCalledWith('safety-minutes', expect.objectContaining({ format: 'CSV' }), undefined);
    expect(out[0]).toBe('Base de datos: localhost:5432/db (esquema integration_x)');
    expect(out.join('\n')).toContain('fila 2, columna Mensaje: El campo es obligatorio.');
    expect(out.join('\n')).not.toContain('clave');
    expect(err).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
    const reports = (await readdir(dir)).filter((name) => name.startsWith('informe-carga-'));
    expect(reports).toEqual(['informe-carga-safety-minutes-validate-20300102-030405000.csv']);
    expect((await readFile(join(dir, reports[0]!), 'utf8')).replace(/^﻿/, '').split('\r\n')[1]).toBe('Minutos,2,Mensaje,Error,REQUIRED_FIELD_MISSING,El campo es obligatorio.');
  });

  it('sin incidencias no escribe informe y sale con 0; no se sobrescribe un informe existente', async () => {
    await writeFile(join(dir, 'm.csv'), 'x');
    const clean = newReport('safety-minutes', 'validate', [{ sheet: 'Minutos', read: 1, toCreate: 1, created: 0, exists: 0, existsDifferent: 0, createdWithWarning: 0, errors: 0 }], [], false);
    const { value } = deps({ loader: { validate: jest.fn(async () => clean) } as unknown as Partial<InitialDataLoader> });
    expect(await runCli(['validate', 'safety-minutes', '--file', 'm.csv'], value)).toBe(EXIT_OK);
    expect((await readdir(dir)).filter((name) => name.startsWith('informe-carga-'))).toEqual([]);

    const withEntries = newReport('safety-minutes', 'validate', [{ sheet: 'Minutos', read: 1, toCreate: 0, created: 0, exists: 1, existsDifferent: 0, createdWithWarning: 0, errors: 0 }], [
      { sheet: 'Minutos', row: 2, column: 'Fecha de visualización', status: 'EXISTS', code: 'ALREADY_EXISTS', message: 'Ya existe.' },
    ], false);
    const second = deps({ loader: { validate: jest.fn(async () => withEntries) } as unknown as Partial<InitialDataLoader> });
    await writeFile(join(dir, 'r.csv'), 'previo');
    expect(await runCli(['validate', 'safety-minutes', '--file', 'm.csv', '--report', 'r.csv'], second.value)).toBe(EXIT_REJECTED);
    expect(await readFile(join(dir, 'r.csv'), 'utf8')).toBe('previo');
  });

  it('apply con un actor rechazado sale con 2 y cierra la aplicación', async () => {
    await writeFile(join(dir, 'm.csv'), 'x');
    const apply = jest.fn(async () => {
      throw new ActorRejectedError('ACTOR_NOT_ADMIN');
    });
    const { value, err, close } = deps({ loader: { apply } as unknown as Partial<InitialDataLoader> });
    expect(await runCli(['apply', 'safety-minutes', '--file', 'm.csv', '--actor', 'a@example.invalid'], value)).toBe(EXIT_REJECTED);
    expect(err.join('\n')).toContain('administrador');
    expect(err.join('\n')).not.toContain('a@example.invalid');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('template escribe los archivos en la carpeta indicada', async () => {
    const templateValues = jest.fn(async () => ({ countries: [], projectTypes: [], sectors: [], units: [], families: [] }));
    const { value, out } = deps({ loader: { templateValues } as unknown as Partial<InitialDataLoader> });
    expect(await runCli(['template', 'products', '--format', 'csv', '--out', 'salida'], value)).toBe(EXIT_OK);
    expect((await readdir(join(dir, 'salida'))).sort()).toEqual(['plantilla-productos-familias.csv', 'plantilla-productos.csv']);
    expect(out.filter((line) => line.startsWith('Plantilla v1 escrita'))).toHaveLength(2);
  });

  it('template no sobrescribe plantillas existentes salvo con --force y escribe CSV con BOM y LF', async () => {
    const templateValues = jest.fn(async () => ({ countries: [], projectTypes: [], sectors: [], units: [], families: [] }));
    const { value, err } = deps({ loader: { templateValues } as unknown as Partial<InitialDataLoader> });
    const argv = ['template', 'safety-minutes', '--format', 'csv', '--out', 'plantillas'];
    expect(await runCli(argv, value)).toBe(EXIT_OK);
    const path = join(dir, 'plantillas', 'plantilla-minuto-seguridad.csv');
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.includes(0x0d)).toBe(false);
    await writeFile(path, 'editada');
    expect(await runCli(argv, value)).toBe(EXIT_REJECTED);
    expect(err.join(' ')).toContain('no se sobrescribe');
    expect(await readFile(path, 'utf8')).toBe('editada');
    expect(await runCli([...argv, '--force'], value)).toBe(EXIT_OK);
    expect((await readFile(path)).length).toBeGreaterThan(10);
  });

  it('--help imprime el uso y sale con 0', async () => {
    const { value, out } = deps();
    expect(await runCli(['--help'], value)).toBe(EXIT_OK);
    expect(out.join('\n')).toContain('Códigos de salida');
  });
});
