export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

/**
 * Sesión tal como la necesita el módulo de autenticación. Nunca lleva el hash
 * del refresh token: el hash solo sirve para buscar, no para devolverse.
 */
export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Sesión que sustituyó a esta al rotar. No nulo = este refresh ya se usó. */
  replacedById: string | null;
}

export interface NewSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

/** Motivos de revocación. Se guardan en `user_sessions.revoked_reason`. */
export type SessionRevocationReason =
  | 'rotated'
  | 'logout'
  | 'refresh_reuse_detected'
  | 'password_changed'
  | 'password_reset_by_admin'
  | 'account_disabled';

export type AccountStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';

/** Credencial local. El hash solo sale de aquí para verificarse en `PasswordService`. */
export interface CredentialRecord {
  id: string;
  passwordHash: string;
  mustChangePassword: boolean;
  expiresAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** Cuenta tal como la necesita el login. Las cuentas borradas no se devuelven. */
export interface AccountRecord {
  userId: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  credential: CredentialRecord | null;
}

export interface SetPasswordInput {
  passwordHash: string;
  mustChangePassword: boolean;
  /** Caducidad de la contraseña (D10); null = sin caducidad. */
  expiresAt: Date | null;
  now: Date;
}

/** Parámetros de seguridad ajustables sin desplegar (`system_parameters`). */
export interface SecuritySettings {
  maxFailedAttempts: number;
  lockoutMinutes: number;
  passwordExpiryDays: number;
}

export interface LoginAttemptInput {
  userId: string | null;
  emailAttempted: string;
  succeeded: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
}

/** Entrada de `audit_logs`. Nunca lleva contraseñas, hashes ni tokens. */
export interface AuditEntryInput {
  event: string;
  correlationId: string;
  subjectId: string | null;
  subjectEmail: string | null;
  resourceType?: string;
  resourceId?: string;
  ipAddress: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Parte del repositorio que usa `SessionService` (D2–D4). */
export interface SessionStore {
  createSession(input: NewSessionInput): Promise<SessionRecord>;

  findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null>;

  /**
   * Rotación atómica (D3): en una sola transacción crea la sesión sucesora y
   * marca la actual como revocada (`rotated`) con `replacedById` apuntando a
   * la nueva, **solo si la actual sigue sin revocar**.
   *
   * Devuelve `null` si la condición no se cumple, es decir, si otra petición
   * la rotó o revocó antes. Sin esta garantía, dos peticiones simultáneas con
   * el mismo token obtendrían dos sesiones válidas y la detección de
   * reutilización no vería nada.
   */
  rotateSession(currentSessionId: string, next: NewSessionInput, now: Date): Promise<SessionRecord | null>;

  /** Revoca una sesión si aún no lo estaba. No toca las ya revocadas. */
  revokeSession(sessionId: string, reason: SessionRevocationReason, now: Date): Promise<void>;

  /** Revoca todas las sesiones vigentes del usuario. Devuelve cuántas revocó. */
  revokeAllUserSessions(userId: string, reason: SessionRevocationReason, now: Date): Promise<number>;
}

/**
 * Puerto de datos de autenticación (ADR-004). Su único adaptador es
 * `PrismaAuthRepository`; ningún servicio de este módulo conoce Prisma.
 */
export interface AuthRepository extends SessionStore {
  // --- Cuentas y credenciales ---------------------------------------------

  /** Busca por correo, sin distinguir mayúsculas. */
  findAccountByEmail(email: string): Promise<AccountRecord | null>;
  findAccountByUserId(userId: string): Promise<AccountRecord | null>;

  /** Crea o sustituye la credencial y limpia intentos fallidos y bloqueo. */
  setPassword(userId: string, input: SetPasswordInput): Promise<void>;

  /** Sustituye solo el hash, para migrar parámetros de Argon2 (needsRehash). */
  updatePasswordHash(credentialId: string, passwordHash: string): Promise<void>;

  /** INVITED → ACTIVE (D14). No toca otros estados. */
  activateInvitedAccount(userId: string): Promise<void>;

  /** Vincula la identidad LOCAL (subject = id del usuario) y anota el acceso. */
  recordSuccessfulLogin(userId: string, now: Date): Promise<void>;

  // --- Bloqueo (D8) ------------------------------------------------------

  /**
   * Reserva un intento de forma atómica, **antes** de verificar la contraseña.
   * Devuelve el número de intento dentro de la ventana actual, o `null` si la
   * credencial está bloqueada. Si el bloqueo ya expiró, la cuenta empieza de 1.
   *
   * Que sea una sola sentencia condicional es lo que impide que N peticiones
   * simultáneas verifiquen N contraseñas: cada una obtiene un número distinto.
   */
  reserveLoginAttempt(credentialId: string, now: Date): Promise<number | null>;
  /**
   * Bloquea hasta `until` si no lo estaba ya. No reinicia el contador: las
   * peticiones en vuelo deben seguir viéndose por encima del umbral.
   * Devuelve `true` solo si este llamado fue el que bloqueó.
   */
  lockCredential(credentialId: string, until: Date, now: Date): Promise<boolean>;
  clearFailedAttempts(credentialId: string): Promise<void>;

  getSecuritySettings(): Promise<SecuritySettings>;

  // --- Trazabilidad --------------------------------------------------------

  recordLoginAttempt(input: LoginAttemptInput): Promise<void>;
  recordAudit(entry: AuditEntryInput): Promise<void>;
}
