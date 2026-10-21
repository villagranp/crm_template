import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { toCsv } from '@/common/csv';
import { AppConfigService } from '@/config/app-config.service';
import { AccessService } from '@/modules/access/access.service';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import {
  type CutoverAccount,
  LOCAL_CREDENTIAL_REVOCATION,
  type LocalCredentialRevocation,
} from './ports/local-credential-revocation.port';

export const CREDENTIALS_REVOKED_EVENT = 'auth.local_credentials_revoked';
export const USER_CREDENTIALS_REVOKED_EVENT = 'user.local_credentials_revoked';

export type CutoverRejection = 'AUTH_PROVIDER_NOT_ENTRA' | 'ACTOR_NOT_FOUND' | 'ACTOR_NOT_ADMIN' | 'ACTOR_NOT_LINKED';

const REJECTION_MESSAGES: Readonly<Record<CutoverRejection, string>> = {
  AUTH_PROVIDER_NOT_ENTRA:
    'AUTH_PROVIDER no es "entra": no se revocan credenciales locales mientras la autenticación local siga siendo la vigente. Cambie AUTH_PROVIDER=entra, reinicie la API y vuelva a ejecutar.',
  ACTOR_NOT_FOUND: 'No existe un usuario con el correo o código de colaborador indicado en --actor.',
  ACTOR_NOT_ADMIN: 'El usuario indicado en --actor no está activo con el rol de administrador vigente.',
  ACTOR_NOT_LINKED:
    'El usuario indicado en --actor no está vinculado con una identidad de Entra ID: tras revocar las credenciales locales no podría volver a entrar. Vincúlelo (load:data entra-identities) y entre una vez por Entra ID antes de revocar.',
};

export class CutoverRejectedError extends Error {
  constructor(readonly reason: CutoverRejection) {
    super(REJECTION_MESSAGES[reason]);
    this.name = 'CutoverRejectedError';
  }
}

export type CutoverOutcome = 'REVOKED' | 'WOULD_REVOKE' | 'UNLINKED_UNTOUCHED' | 'NOTHING_TO_REVOKE';

/** Una fila del informe: ids internos y estados, **nunca** correos, nombres ni códigos de colaborador. */
export interface CutoverRow {
  readonly userId: string;
  readonly status: string;
  /** Cuenta eliminada (borrado lógico): se le borra la credencial aunque no tenga vínculo. */
  readonly deleted: boolean;
  readonly linked: boolean;
  readonly hasCredential: boolean;
  readonly activeSessions: number;
  readonly outcome: CutoverOutcome;
}

export interface CutoverTotals {
  readonly accounts: number;
  readonly linked: number;
  /** Vinculadas a las que se retira credencial o sesiones. */
  readonly toRevoke: number;
  readonly credentialsDeleted: number;
  readonly sessionsRevoked: number;
  /** Cuentas eliminadas con credencial o sesiones: se retiran siempre. */
  readonly deletedToRevoke: number;
  /** Sin vínculo `ENTRA_ID` y **no eliminadas**: no se tocan (de cualquier estado). */
  readonly unlinked: number;
  /** Sin vínculo y `ACTIVE`/`INVITED`: tras el corte no podrán entrar; es lo que hace abortar `--require-all-linked`. */
  readonly unlinkedUsable: number;
  readonly unlinkedWithCredential: number;
}

export interface CutoverReport {
  readonly mode: 'validate' | 'apply';
  readonly applied: boolean;
  /** `true` si `--require-all-linked` abortó el apply por haber cuentas utilizables sin vincular. */
  readonly aborted: boolean;
  readonly totals: CutoverTotals;
  readonly rows: readonly CutoverRow[];
}

export interface ApplyOptions {
  /**
   * Aborta sin tocar nada si queda alguna cuenta `ACTIVE`/`INVITED` sin vincular. Es el comportamiento por
   * defecto del CLI (`--allow-unlinked` lo omite): borrar credenciales dejando fuera a alguien es lo difícil de deshacer.
   */
  readonly requireAllLinked: boolean;
}

/**
 * Revocación de las credenciales locales tras el corte a Entra ID (ADR-027, decisión 2; ADR-019 paso 5):
 * borra `user_credentials` y revoca las sesiones locales **solo** de las cuentas que ya tienen una
 * identidad `ENTRA_ID` vinculada. Las que no, se cuentan y se listan por id, y no se tocan: borrarles
 * la contraseña sin que puedan entrar por Entra las dejaría fuera.
 *
 * También se borra la credencial de las cuentas **eliminadas** (borrado lógico), vinculadas o no: no pueden
 * entrar, y una credencial que nadie vigila es peor que ninguna (ADR-019).
 *
 * `validate` (la omisión) no escribe nada y funciona con cualquier `AUTH_PROVIDER`, para poder preparar
 * el corte. `apply` exige `AUTH_PROVIDER=entra`, un administrador activo **vinculado por `ENTRA_ID`** (si no,
 * el propio corte lo dejaría fuera) y confirmación explícita (la pide la línea de comandos). Es idempotente: repetirlo no encuentra nada que revocar.
 */
@Injectable()
export class LocalCredentialRevocationService {
  constructor(
    @Inject(LOCAL_CREDENTIAL_REVOCATION) private readonly revocation: LocalCredentialRevocation,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  get authProvider(): string {
    return this.config.get('AUTH_PROVIDER');
  }

  async validate(actorIdentifier?: string, now: Date = new Date()): Promise<CutoverReport> {
    if (actorIdentifier !== undefined) {
      await this.resolveActor(actorIdentifier);
    }
    return this.plan('validate', now);
  }

  async apply(actorIdentifier: string, options: ApplyOptions, now: Date = new Date()): Promise<CutoverReport> {
    if (this.config.get('AUTH_PROVIDER') !== 'entra') {
      throw new CutoverRejectedError('AUTH_PROVIDER_NOT_ENTRA');
    }
    const actor = await this.resolveActor(actorIdentifier);
    if (!(await this.access.isLinkedTo(actor.actorId as string, 'ENTRA_ID'))) {
      throw new CutoverRejectedError('ACTOR_NOT_LINKED');
    }
    const planned = await this.plan('apply', now);

    if (options.requireAllLinked && planned.totals.unlinkedUsable > 0) {
      return { ...planned, aborted: true };
    }

    const targets = planned.rows.filter((row) => row.outcome === 'WOULD_REVOKE').map((row) => row.userId);
    const result = await this.revocation.revoke(targets, now);

    const rows = planned.rows.map((row): CutoverRow => (row.outcome === 'WOULD_REVOKE' ? { ...row, outcome: 'REVOKED' } : row));
    const totals: CutoverTotals = { ...planned.totals, credentialsDeleted: result.credentialsDeleted, sessionsRevoked: result.sessionsRevoked };

    await this.audit.record(CREDENTIALS_REVOKED_EVENT, actor, {
      resourceType: 'authentication',
      resourceId: 'local-credentials',
      metadata: {
        accounts: totals.accounts,
        linked: totals.linked,
        credentialsDeleted: totals.credentialsDeleted,
        sessionsRevoked: totals.sessionsRevoked,
        unlinkedUntouched: totals.unlinked,
        deletedAccounts: totals.deletedToRevoke,
        requireAllLinked: options.requireAllLinked,
      },
    });
    for (const row of rows.filter((candidate) => candidate.outcome === 'REVOKED')) {
      await this.audit.record(USER_CREDENTIALS_REVOKED_EVENT, actor, {
        resourceType: 'user',
        resourceId: row.userId,
        metadata: { hadCredential: row.hasCredential, sessionsRevoked: row.activeSessions, source: 'CUTOVER_SCRIPT' },
      });
    }

    return { mode: 'apply', applied: true, aborted: false, totals, rows };
  }

  private async plan(mode: 'validate' | 'apply', now: Date): Promise<CutoverReport> {
    const accounts = await this.revocation.listAccounts(now);
    const rows = accounts.map((account) => toRow(account));
    const live = accounts.filter((account) => !account.deleted);
    const unlinked = live.filter((account) => !account.linked);
    const totals: CutoverTotals = {
      accounts: accounts.length,
      linked: live.length - unlinked.length,
      deletedToRevoke: rows.filter((row) => row.deleted && row.outcome === 'WOULD_REVOKE').length,
      toRevoke: rows.filter((row) => row.outcome === 'WOULD_REVOKE').length,
      credentialsDeleted: 0,
      sessionsRevoked: 0,
      unlinked: unlinked.length,
      unlinkedUsable: unlinked.filter((account) => account.status === 'ACTIVE' || account.status === 'INVITED').length,
      unlinkedWithCredential: unlinked.filter((account) => account.hasCredential).length,
    };
    return { mode, applied: false, aborted: false, totals, rows };
  }

  /** Administrador activo (ADR-020) por correo o código de colaborador; el mensaje nunca repite lo escrito. */
  private async resolveActor(identifier: string): Promise<AuditContext> {
    const user = await this.access.findUserRefByIdentifier(identifier);
    if (!user) {
      throw new CutoverRejectedError('ACTOR_NOT_FOUND');
    }
    if (!(await this.access.isAdministrador(user.id))) {
      throw new CutoverRejectedError('ACTOR_NOT_ADMIN');
    }
    return { correlationId: randomUUID(), actorId: user.id, actorEmail: user.email, ipAddress: null };
  }
}

function toRow(account: CutoverAccount): CutoverRow {
  const hasLocalAccess = account.hasCredential || account.activeSessions > 0;
  // Una cuenta eliminada se limpia siempre; una viva, solo si ya puede entrar por Entra ID.
  const outcome: CutoverOutcome = account.deleted || account.linked ? (hasLocalAccess ? 'WOULD_REVOKE' : 'NOTHING_TO_REVOKE') : 'UNLINKED_UNTOUCHED';
  return {
    userId: account.userId,
    status: account.status,
    deleted: account.deleted,
    linked: account.linked,
    hasCredential: account.hasCredential,
    activeSessions: account.activeSessions,
    outcome,
  };
}

const OUTCOME_LABELS: Readonly<Record<CutoverOutcome, string>> = {
  REVOKED: 'Revocada',
  WOULD_REVOKE: 'Se revocaría',
  UNLINKED_UNTOUCHED: 'Sin vínculo (no se toca)',
  NOTHING_TO_REVOKE: 'Vinculada, sin credencial ni sesiones',
};

export const CUTOVER_CSV_HEADERS = ['Id de usuario', 'Estado', 'Vinculada con Entra ID', 'Tiene credencial local', 'Sesiones vigentes', 'Resultado'] as const;

/** CSV del informe: una fila por cuenta, solo ids internos y estados. */
export function buildCutoverCsv(report: CutoverReport): string {
  return toCsv(report.rows, [
    { header: CUTOVER_CSV_HEADERS[0], value: (row) => row.userId },
    { header: CUTOVER_CSV_HEADERS[1], value: (row) => (row.deleted ? 'ELIMINADA' : row.status) },
    { header: CUTOVER_CSV_HEADERS[2], value: (row) => (row.linked ? 'Sí' : 'No') },
    { header: CUTOVER_CSV_HEADERS[3], value: (row) => (row.hasCredential ? 'Sí' : 'No') },
    { header: CUTOVER_CSV_HEADERS[4], value: (row) => row.activeSessions },
    { header: CUTOVER_CSV_HEADERS[5], value: (row) => OUTCOME_LABELS[row.outcome] },
  ]);
}

/** Máximo de cuentas sin vincular que se listan en consola; el CSV las trae todas. */
export const CONSOLE_UNLINKED_LIMIT = 50;

/** Resumen para la consola: conteos y los ids de las cuentas sin vincular. Sin correos, nombres ni códigos. */
export function formatCutoverSummary(report: CutoverReport, authProvider: string): string[] {
  const { totals } = report;
  const lines: string[] = [];
  const modeText = report.mode === 'validate' ? 'validar (no se escribió nada)' : report.applied ? 'aplicar' : 'aplicar (no se aplicó nada)';
  lines.push(`Revocación de credenciales locales - AUTH_PROVIDER=${authProvider} - modo: ${modeText}`);
  lines.push(`  Cuentas: ${totals.accounts} - vivas vinculadas con Entra ID: ${totals.linked} - vivas sin vínculo: ${totals.unlinked} - eliminadas con credencial o sesiones: ${totals.deletedToRevoke}`);
  if (report.applied) {
    lines.push(`  Credenciales locales borradas: ${totals.credentialsDeleted} - sesiones revocadas: ${totals.sessionsRevoked}`);
  } else {
    lines.push(`  Cuentas (vinculadas o eliminadas) con credencial o sesiones locales por retirar: ${totals.toRevoke}`);
  }
  lines.push(`  Sin vínculo y utilizables (ACTIVE/INVITED): ${totals.unlinkedUsable} - de las sin vínculo, con credencial local: ${totals.unlinkedWithCredential}`);
  const unlinked = report.rows.filter((row) => !row.linked && !row.deleted);
  for (const row of unlinked.slice(0, CONSOLE_UNLINKED_LIMIT)) {
    lines.push(`  [Sin vínculo, no se toca] ${row.userId} (${row.status})`);
  }
  if (unlinked.length > CONSOLE_UNLINKED_LIMIT) {
    lines.push(`  ... y ${unlinked.length - CONSOLE_UNLINKED_LIMIT} cuentas sin vínculo más (todas están en el archivo de informe).`);
  }
  if (report.aborted) {
    lines.push(`Resultado: ABORTADO: ${totals.unlinkedUsable} cuenta(s) ACTIVE/INVITED sin vincular. No se revocó nada. Vincúlelas (load:data entra-identities) y repita, o use --allow-unlinked para dejarlas con su credencial local.`);
  } else if (report.mode === 'validate') {
    lines.push('Resultado: simulación. Nada se escribió; ejecute `apply --confirm --actor <administrador>` con AUTH_PROVIDER=entra para aplicar.');
  } else {
    lines.push(totals.unlinked > 0 ? 'Resultado: aplicado. Las cuentas sin vínculo conservan su credencial local (inactiva con AUTH_PROVIDER=entra).' : 'Resultado: aplicado.');
  }
  return lines;
}
