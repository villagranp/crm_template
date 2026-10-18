import type { AppConfigService } from '@/config/app-config.service';
import type { AccessService } from '@/modules/access/access.service';
import type { AuditService } from '@/modules/audit/audit.service';

import {
  buildCutoverCsv,
  CREDENTIALS_REVOKED_EVENT,
  CUTOVER_CSV_HEADERS,
  CutoverRejectedError,
  formatCutoverSummary,
  LocalCredentialRevocationService,
  USER_CREDENTIALS_REVOKED_EVENT,
} from './local-credential-revocation.service';
import type { CutoverAccount, LocalCredentialRevocation } from './ports/local-credential-revocation.port';

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-10-15T12:00:00.000Z');

const account = (id: string, overrides: Partial<CutoverAccount> = {}): CutoverAccount => ({
  userId: id,
  status: 'ACTIVE',
  deleted: false,
  linked: true,
  hasCredential: true,
  activeSessions: 0,
  ...overrides,
});

function build(accounts: CutoverAccount[], options: { provider?: string; admin?: boolean; actorFound?: boolean; actorLinked?: boolean } = {}) {
  const revocation = {
    listAccounts: jest.fn(async () => accounts),
    revoke: jest.fn(async (ids: readonly string[]) => ({
      credentialsDeleted: accounts.filter((candidate) => ids.includes(candidate.userId) && candidate.hasCredential).length,
      sessionsRevoked: accounts.filter((candidate) => ids.includes(candidate.userId)).reduce((total, candidate) => total + candidate.activeSessions, 0),
    })),
  };
  const access = {
    findUserRefByIdentifier: jest.fn(async () => (options.actorFound === false ? null : { id: ADMIN_ID, email: 'admin@example.invalid' })),
    isAdministrador: jest.fn(async () => options.admin ?? true),
    isLinkedTo: jest.fn(async () => options.actorLinked ?? true),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => options.provider ?? 'entra') };
  const service = new LocalCredentialRevocationService(
    revocation as unknown as LocalCredentialRevocation,
    access as unknown as AccessService,
    audit as unknown as AuditService,
    config as unknown as AppConfigService,
  );
  return { service, revocation, access, audit };
}

const ACCOUNTS = [
  account('linked-with-credential', { activeSessions: 2 }),
  account('linked-sessions-only', { hasCredential: false, activeSessions: 1 }),
  account('linked-nothing', { hasCredential: false, activeSessions: 0 }),
  account('unlinked-active', { linked: false }),
  account('unlinked-suspended', { status: 'SUSPENDED', linked: false }),
];

describe('LocalCredentialRevocationService · validate', () => {
  it('no escribe nada: cuenta lo que se revocaría y lista las cuentas sin vínculo', async () => {
    const { service, revocation, audit } = build(ACCOUNTS);
    const report = await service.validate(undefined, NOW);
    expect(report).toMatchObject({ mode: 'validate', applied: false, aborted: false });
    expect(report.totals).toEqual({
      accounts: 5,
      linked: 3,
      toRevoke: 2,
      credentialsDeleted: 0,
      sessionsRevoked: 0,
      deletedToRevoke: 0,
      unlinked: 2,
      unlinkedUsable: 1,
      unlinkedWithCredential: 2,
    });
    expect(report.rows.map((row) => [row.userId, row.outcome])).toEqual([
      ['linked-with-credential', 'WOULD_REVOKE'],
      ['linked-sessions-only', 'WOULD_REVOKE'],
      ['linked-nothing', 'NOTHING_TO_REVOKE'],
      ['unlinked-active', 'UNLINKED_UNTOUCHED'],
      ['unlinked-suspended', 'UNLINKED_UNTOUCHED'],
    ]);
    expect(revocation.revoke).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('funciona con cualquier AUTH_PROVIDER (sirve para preparar el corte)', async () => {
    const { service } = build(ACCOUNTS, { provider: 'local' });
    await expect(service.validate()).resolves.toMatchObject({ applied: false });
  });

  it('con un actor indicado lo comprueba (administrador activo)', async () => {
    await expect(build(ACCOUNTS, { admin: false }).service.validate('admin@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_NOT_ADMIN' });
    await expect(build(ACCOUNTS, { actorFound: false }).service.validate('nadie@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_NOT_FOUND' });
  });
});

describe('LocalCredentialRevocationService · apply', () => {
  it('con AUTH_PROVIDER distinto de entra se rechaza antes de leer o escribir nada', async () => {
    for (const provider of ['local', 'hybrid']) {
      const { service, revocation, access } = build(ACCOUNTS, { provider });
      await expect(service.apply('admin@example.invalid', { requireAllLinked: false })).rejects.toMatchObject({ reason: 'AUTH_PROVIDER_NOT_ENTRA' });
      expect(access.findUserRefByIdentifier).not.toHaveBeenCalled();
      expect(revocation.listAccounts).not.toHaveBeenCalled();
      expect(revocation.revoke).not.toHaveBeenCalled();
    }
  });

  it('rechaza SIEMPRE al actor que no está vinculado por Entra ID: el corte lo dejaría fuera (y no toca nada)', async () => {
    const { service, revocation, audit } = build(ACCOUNTS, { actorLinked: false });
    await expect(service.apply('admin@example.invalid', { requireAllLinked: false })).rejects.toMatchObject({ reason: 'ACTOR_NOT_LINKED' });
    await expect(service.apply('admin@example.invalid', { requireAllLinked: true })).rejects.toMatchObject({ reason: 'ACTOR_NOT_LINKED' });
    expect(revocation.listAccounts).not.toHaveBeenCalled();
    expect(revocation.revoke).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('comprueba el vínculo del actor con ENTRA_ID', async () => {
    const { service, access } = build(ACCOUNTS);
    await service.apply('admin@example.invalid', { requireAllLinked: false }, NOW);
    expect(access.isLinkedTo).toHaveBeenCalledWith(ADMIN_ID, 'ENTRA_ID');
  });

  it('exige un actor administrador activo', async () => {
    const { service, revocation } = build(ACCOUNTS, { admin: false });
    await expect(service.apply('admin@example.invalid', { requireAllLinked: false })).rejects.toBeInstanceOf(CutoverRejectedError);
    expect(revocation.revoke).not.toHaveBeenCalled();
  });

  it('el mensaje de rechazo del actor no repite lo escrito en --actor', async () => {
    const { service } = build(ACCOUNTS, { actorFound: false });
    const error = await service.apply('secreto@example.invalid', { requireAllLinked: false }).catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain('secreto');
  });

  it('revoca solo a las cuentas vinculadas con credencial o sesiones; las demás no se tocan', async () => {
    const { service, revocation } = build(ACCOUNTS);
    const report = await service.apply('admin@example.invalid', { requireAllLinked: false }, NOW);
    expect(revocation.revoke).toHaveBeenCalledTimes(1);
    expect(revocation.revoke).toHaveBeenCalledWith(['linked-with-credential', 'linked-sessions-only'], NOW);
    expect(report).toMatchObject({ applied: true, aborted: false });
    expect(report.totals).toMatchObject({ toRevoke: 2, credentialsDeleted: 1, sessionsRevoked: 3, unlinked: 2 });
    expect(report.rows.filter((row) => row.outcome === 'REVOKED').map((row) => row.userId)).toEqual(['linked-with-credential', 'linked-sessions-only']);
    expect(report.rows.filter((row) => row.outcome === 'UNLINKED_UNTOUCHED')).toHaveLength(2);
  });

  it('audita un resumen y un evento por cuenta revocada, con el administrador como actor y sin correos ni nombres', async () => {
    const { service, audit } = build(ACCOUNTS);
    await service.apply('admin@example.invalid', { requireAllLinked: false }, NOW);
    expect(audit.record).toHaveBeenCalledTimes(3);
    const summary = audit.record.mock.calls[0] as unknown[];
    expect(summary[0]).toBe(CREDENTIALS_REVOKED_EVENT);
    expect(summary[1]).toMatchObject({ actorId: ADMIN_ID, actorEmail: 'admin@example.invalid', ipAddress: null });
    expect(summary[2]).toMatchObject({ metadata: { accounts: 5, linked: 3, credentialsDeleted: 1, sessionsRevoked: 3, unlinkedUntouched: 2, requireAllLinked: false } });
    expect(audit.record.mock.calls.slice(1).map((call) => [(call as unknown[])[0], ((call as unknown[])[2] as { resourceId: string }).resourceId])).toEqual([
      [USER_CREDENTIALS_REVOKED_EVENT, 'linked-with-credential'],
      [USER_CREDENTIALS_REVOKED_EVENT, 'linked-sessions-only'],
    ]);
  });

  it('--require-all-linked aborta sin tocar nada si hay cuentas ACTIVE o INVITED sin vincular', async () => {
    const { service, revocation, audit } = build(ACCOUNTS);
    const report = await service.apply('admin@example.invalid', { requireAllLinked: true }, NOW);
    expect(report).toMatchObject({ applied: false, aborted: true });
    expect(revocation.revoke).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('--require-all-linked procede si lo único sin vincular está suspendido o bloqueado', async () => {
    const { service, revocation } = build([account('a'), account('b', { linked: false, status: 'SUSPENDED' }), account('c', { linked: false, status: 'LOCKED' })]);
    const report = await service.apply('admin@example.invalid', { requireAllLinked: true }, NOW);
    expect(report).toMatchObject({ applied: true, aborted: false });
    expect(revocation.revoke).toHaveBeenCalledWith(['a'], NOW);
  });

  it('es idempotente: sin nada que revocar no escribe cuentas y el resultado son ceros', async () => {
    const { service, revocation } = build([account('a', { hasCredential: false }), account('b', { linked: false })]);
    const report = await service.apply('admin@example.invalid', { requireAllLinked: false }, NOW);
    expect(revocation.revoke).toHaveBeenCalledWith([], NOW);
    expect(report.totals).toMatchObject({ toRevoke: 0, credentialsDeleted: 0, sessionsRevoked: 0 });
  });
});

describe('cuentas eliminadas (borrado lógico)', () => {
  const WITH_DELETED = [
    account('live-linked'),
    account('deleted-unlinked', { deleted: true, linked: false, status: 'ACTIVE', activeSessions: 1 }),
    account('deleted-linked-no-credential', { deleted: true, hasCredential: false }),
    account('live-unlinked-suspended', { linked: false, status: 'SUSPENDED' }),
  ];

  it('se les borra la credencial y las sesiones aunque no tengan vínculo, y no cuentan como «sin vincular»', async () => {
    const { service, revocation } = build(WITH_DELETED);
    const report = await service.apply('admin@example.invalid', { requireAllLinked: true }, NOW);
    expect(report).toMatchObject({ applied: true, aborted: false });
    expect(revocation.revoke).toHaveBeenCalledWith(['live-linked', 'deleted-unlinked'], NOW);
    expect(report.totals).toMatchObject({ accounts: 4, linked: 1, unlinked: 1, unlinkedUsable: 0, deletedToRevoke: 1 });
    expect(report.rows.map((row) => [row.userId, row.outcome])).toEqual([
      ['live-linked', 'REVOKED'],
      ['deleted-unlinked', 'REVOKED'],
      ['deleted-linked-no-credential', 'NOTHING_TO_REVOKE'],
      ['live-unlinked-suspended', 'UNLINKED_UNTOUCHED'],
    ]);
  });

  it('el CSV las marca ELIMINADA y la consola no las lista como sin vínculo', async () => {
    const { service } = build(WITH_DELETED);
    const report = await service.validate();
    expect(buildCutoverCsv(report)).toContain('deleted-unlinked,ELIMINADA,No,Sí,1,Se revocaría');
    const lines = formatCutoverSummary(report, 'entra').join('\n');
    expect(lines).not.toContain('[Sin vínculo, no se toca] deleted-unlinked');
    expect(lines).toContain('[Sin vínculo, no se toca] live-unlinked-suspended');
  });
});

describe('informe de la revocación', () => {
  it('el CSV trae solo ids internos y estados, con los encabezados del contrato', async () => {
    const { service } = build(ACCOUNTS);
    const report = await service.validate();
    const csv = buildCutoverCsv(report);
    expect(csv.replace(/^﻿/, '').split('\r\n')[0]).toBe(CUTOVER_CSV_HEADERS.join(','));
    expect(csv).toContain('unlinked-active,ACTIVE,No,Sí,0,Sin vínculo (no se toca)');
    expect(csv).not.toMatch(/@/);
  });

  it('la consola lista los ids sin vínculo y nunca correos', async () => {
    const { service } = build(ACCOUNTS);
    const lines = formatCutoverSummary(await service.validate(), 'entra');
    expect(lines.join('\n')).toContain('[Sin vínculo, no se toca] unlinked-active (ACTIVE)');
    expect(lines.join('\n')).not.toMatch(/@/);
    expect(lines.at(-1)).toContain('simulación');
  });

  it('con más de 50 cuentas sin vínculo la consola resume y remite al archivo', async () => {
    const many = Array.from({ length: 60 }, (_, index) => account(`u-${index}`, { linked: false }));
    const lines = formatCutoverSummary(await build(many).service.validate(), 'entra');
    expect(lines.filter((line) => line.startsWith('  [Sin vínculo'))).toHaveLength(50);
    expect(lines.join('\n')).toContain('y 10 cuentas sin vínculo más');
  });

  it('aborto y aplicado tienen su resultado', async () => {
    const aborted = formatCutoverSummary(await build(ACCOUNTS).service.apply('a@example.invalid', { requireAllLinked: true }), 'entra');
    expect(aborted.at(-1)).toContain('ABORTADO');
    const applied = formatCutoverSummary(await build([account('a')]).service.apply('a@example.invalid', { requireAllLinked: false }), 'entra');
    expect(applied.at(-1)).toBe('Resultado: aplicado.');
  });
});
