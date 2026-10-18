import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type CutoverReport, CutoverRejectedError } from '../local-credential-revocation.service';
import { type CliDeps, EXIT_ABORTED, EXIT_APPLIED_REPORT_FAILED, EXIT_OK, EXIT_REJECTED, parseArgs, runCli } from './revoke-local-credentials.cli';

describe('parseArgs', () => {
  const parse = (...argv: string[]) => parseArgs(argv);

  it('sin subcomando valida (nunca se escribe por omisión), con o sin el `--` de pnpm', () => {
    expect(parse()).toEqual({ ok: true, command: { kind: 'validate', actor: null, report: null } });
    expect(parse('--', 'validate', '--actor', 'a@example.invalid', '--report', 'r.csv')).toEqual({
      ok: true,
      command: { kind: 'validate', actor: 'a@example.invalid', report: 'r.csv' },
    });
  });

  it('apply exige --actor y --confirm', () => {
    expect(parse('apply', '--confirm')).toEqual({ ok: false, message: expect.stringContaining('--actor') });
    expect(parse('apply', '--actor', 'EMP-1')).toEqual({ ok: false, message: expect.stringContaining('--confirm') });
    expect(parse('apply', '--confirm', '--actor', 'EMP-1', '--require-all-linked')).toEqual({
      ok: true,
      command: { kind: 'apply', actor: 'EMP-1', report: null, requireAllLinked: true },
    });
  });

  it('--require-all-linked es el comportamiento POR DEFECTO; --allow-unlinked lo omite; juntos se contradicen', () => {
    expect(parse('apply', '--confirm', '--actor', 'EMP-1')).toMatchObject({ ok: true, command: { requireAllLinked: true } });
    expect(parse('apply', '--confirm', '--actor', 'EMP-1', '--allow-unlinked')).toMatchObject({ ok: true, command: { requireAllLinked: false } });
    expect(parse('apply', '--confirm', '--actor', 'EMP-1', '--allow-unlinked', '--require-all-linked')).toMatchObject({ ok: false });
    expect(parse('validate', '--allow-unlinked')).toMatchObject({ ok: false });
  });

  it('validate rechaza --confirm y --require-all-linked', () => {
    expect(parse('validate', '--confirm')).toMatchObject({ ok: false });
    expect(parse('--require-all-linked')).toMatchObject({ ok: false });
  });

  it('rechaza opciones desconocidas o repetidas, valores vacíos y argumentos sobrantes', () => {
    expect(parse('apply', '--forzar')).toMatchObject({ ok: false });
    expect(parse('validate', '--actor', 'a', '--actor', 'b')).toMatchObject({ ok: false });
    expect(parse('validate', '--actor')).toMatchObject({ ok: false });
    expect(parse('validate', '--actor', '--report', 'r.csv')).toMatchObject({ ok: false });
    expect(parse('validate', 'sobrante')).toMatchObject({ ok: false });
    expect(parse('apply', '--confirm=algo', '--actor', 'a')).toMatchObject({ ok: false });
  });

  it('--help y help muestran el uso', () => {
    expect(parse('--help')).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parse('help')).toEqual({ ok: true, command: { kind: 'help' } });
  });
});

const report = (overrides: Partial<CutoverReport> = {}): CutoverReport => ({
  mode: 'validate',
  applied: false,
  aborted: false,
  totals: { accounts: 1, linked: 0, toRevoke: 0, deletedToRevoke: 0, credentialsDeleted: 0, sessionsRevoked: 0, unlinked: 1, unlinkedUsable: 1, unlinkedWithCredential: 1 },
  rows: [{ userId: 'user-1', status: 'ACTIVE', deleted: false, linked: false, hasCredential: true, activeSessions: 0, outcome: 'UNLINKED_UNTOUCHED' }],
  ...overrides,
});

describe('runCli', () => {
  let workDir: string;
  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'revocar-credenciales-'));
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function setup(service: Partial<{ validate: jest.Mock; apply: jest.Mock }> = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const close = jest.fn(async () => undefined);
    const full = {
      validate: service.validate ?? jest.fn(async () => report()),
      apply: service.apply ?? jest.fn(async () => report({ mode: 'apply', applied: true })),
      authProvider: 'entra',
    };
    const deps: CliDeps = {
      cwd: workDir,
      now: () => new Date('2026-10-15T12:00:00.000Z'),
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      open: async () => ({ service: full, close }),
    };
    return { deps, out, err, close, service: full };
  }

  it('uso incorrecto: sale con 2 sin abrir el contexto', async () => {
    const { deps, err } = setup();
    const open = jest.spyOn(deps, 'open');
    await expect(runCli(['apply'], deps)).resolves.toBe(EXIT_REJECTED);
    expect(open).not.toHaveBeenCalled();
    expect(err.join('\n')).toContain('--actor');
  });

  it('validate escribe el informe CSV (solo ids) y no llama a apply', async () => {
    const { deps, out, service, close } = setup();
    await expect(runCli(['validate'], deps)).resolves.toBe(EXIT_OK);
    expect(service.apply).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    const files = (await readdir(workDir)).filter((name) => name.startsWith('informe-revocacion-credenciales-validate-'));
    expect(files).toHaveLength(1);
    const csv = await readFile(join(workDir, files[0]!), 'utf8');
    expect(csv).toContain('user-1,ACTIVE,No,Sí,0,Sin vínculo (no se toca)');
    expect(out.join('\n')).toContain('Informe por cuenta (solo ids internos)');
    expect(out.join('\n')).not.toMatch(/@/);
  });

  it('apply pasa el actor y la opción y devuelve 0; con aborto devuelve 1', async () => {
    const ok = setup();
    await expect(runCli(['apply', '--confirm', '--actor', 'admin@example.invalid'], ok.deps)).resolves.toBe(EXIT_OK);
    expect(ok.service.apply).toHaveBeenCalledWith('admin@example.invalid', { requireAllLinked: true }, expect.any(Date));

    const lenient = setup();
    await runCli(['apply', '--confirm', '--actor', 'admin@example.invalid', '--allow-unlinked', '--report', 'otro.csv'], lenient.deps);
    expect(lenient.service.apply).toHaveBeenCalledWith('admin@example.invalid', { requireAllLinked: false }, expect.any(Date));

    const aborted = setup({ apply: jest.fn(async () => report({ mode: 'apply', aborted: true })) });
    await expect(runCli(['apply', '--confirm', '--actor', 'a@example.invalid', '--require-all-linked', '--report', 'abortado.csv'], aborted.deps)).resolves.toBe(EXIT_ABORTED);
  });

  it('un rechazo del servicio (entorno o actor) sale con 2, dice que no se revocó nada y cierra el contexto', async () => {
    const { deps, err, close } = setup({ apply: jest.fn(async () => Promise.reject(new CutoverRejectedError('AUTH_PROVIDER_NOT_ENTRA'))) });
    await expect(runCli(['apply', '--confirm', '--actor', 'a@example.invalid'], deps)).resolves.toBe(EXIT_REJECTED);
    expect(err.join('\n')).toContain('No se revocó nada');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('un error inesperado se propaga (el script lo reduce al nombre) y aun así cierra el contexto', async () => {
    const { deps, close } = setup({ validate: jest.fn(async () => Promise.reject(new Error('fila con datos'))) });
    await expect(runCli(['validate'], deps)).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('no sobrescribe un informe existente: avisa y sale con 2', async () => {
    const { deps, err } = setup();
    await writeFile(join(workDir, 'r.csv'), 'previo');
    await expect(runCli(['validate', '--report', 'r.csv'], deps)).resolves.toBe(EXIT_REJECTED);
    expect(await readFile(join(workDir, 'r.csv'), 'utf8')).toBe('previo');
    expect(err.join('\n')).toContain('--report');
  });

  it('si falla escribir el informe DESPUÉS de aplicar, el código es propio (4) y el aviso dice que la revocación SÍ se aplicó', async () => {
    const { deps, err } = setup();
    await writeFile(join(workDir, 'existente.csv'), 'previo');
    await expect(runCli(['apply', '--confirm', '--actor', 'a@example.invalid', '--report', 'existente.csv'], deps)).resolves.toBe(EXIT_APPLIED_REPORT_FAILED);
    expect(err.join('\n')).toContain('SÍ se aplicó');
    expect(err.join('\n')).not.toContain('No se revocó nada');
    expect(await readFile(join(workDir, 'existente.csv'), 'utf8')).toBe('previo');
  });

  it('--help imprime el uso sin abrir el contexto', async () => {
    const { deps, out } = setup();
    const open = jest.spyOn(deps, 'open');
    await expect(runCli(['--help'], deps)).resolves.toBe(EXIT_OK);
    expect(open).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('--require-all-linked');
  });
});
