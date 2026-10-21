/**
 * Puerto del corte a Entra ID (ADR-027): lee qué cuentas tienen credencial o sesiones locales y
 * las retira. Su adaptador Prisma vive en
 * `infrastructure/database/prisma/repositories/prisma-local-credential-revocation.repository.ts`.
 */

export const LOCAL_CREDENTIAL_REVOCATION = Symbol('LOCAL_CREDENTIAL_REVOCATION');

export type CutoverUserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';

/** Una cuenta, con lo que el corte necesita saber. Nada de datos personales. */
export interface CutoverAccount {
  readonly userId: string;
  readonly status: CutoverUserStatus;
  /** Borrada lógicamente: no puede entrar por ningún medio, pero su credencial sigue en la base. */
  readonly deleted: boolean;
  /** Tiene una identidad `ENTRA_ID` vinculada. */
  readonly linked: boolean;
  readonly hasCredential: boolean;
  /** Sesiones locales sin revocar y sin caducar. */
  readonly activeSessions: number;
}

export interface RevocationResult {
  readonly credentialsDeleted: number;
  readonly sessionsRevoked: number;
}

export interface LocalCredentialRevocation {
  /** Todas las cuentas, **incluidas las eliminadas** (su credencial también se borra, B6 de la revisión de ADR-027). */
  listAccounts(now: Date): Promise<CutoverAccount[]>;
  /**
   * En **una** transacción: borra las credenciales locales (`user_credentials`) y revoca las sesiones
   * (refresh tokens) sin revocar de esos usuarios. Un usuario sin credencial ni sesiones no cuenta.
   */
  revoke(userIds: readonly string[], now: Date): Promise<RevocationResult>;
}
