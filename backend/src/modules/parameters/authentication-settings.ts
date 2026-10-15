/** Proveedores admitidos por `AUTH_PROVIDER` (`config/env.schema.ts`, ADR-019). */
export type AuthProviderSetting = 'local' | 'entra' | 'hybrid';

/**
 * Parámetros funcionales del login local (ADR-019), editables en el bloque "Acceso"
 * de la pantalla de parámetros (07 B.4, E.4). Los lee `AuthRepository.getSecuritySettings`.
 */
export const LOGIN_SECURITY_PARAMETERS = {
  maxFailedAttempts: 'seguridad.intentos_fallidos_maximos',
  lockoutMinutes: 'seguridad.minutos_bloqueo',
  passwordExpiryDays: 'seguridad.dias_caducidad_password',
} as const;

/**
 * Única lista de las claves `seguridad.*` del login local: la usan el registro
 * de reglas, los rangos, la configuración de autenticación y el adaptador que
 * las lee (`PrismaAuthRepository`).
 */
export const LOGIN_SECURITY_PARAMETER_KEYS = [
  LOGIN_SECURITY_PARAMETERS.maxFailedAttempts,
  LOGIN_SECURITY_PARAMETERS.lockoutMinutes,
  LOGIN_SECURITY_PARAMETERS.passwordExpiryDays,
] as const;

export interface AuthenticationSettings {
  readonly provider: AuthProviderSetting;
  /** `false` con `entra`: los parámetros de login local no aplican (07 K.3). */
  readonly localLoginEnabled: boolean;
  readonly securityParameterKeys: readonly string[];
}

/**
 * Configuración de autenticación en **solo lectura** (07 D-07.8, RN-07.34): sale de la
 * variable de despliegue `AUTH_PROVIDER`, no de la base. Por construcción solo
 * devuelve el nombre del proveedor y si el login local está habilitado: nunca
 * secretos, ids de tenant ni configuración de JWT (07 H.4).
 */
export function authenticationSettings(provider: AuthProviderSetting): AuthenticationSettings {
  return {
    provider,
    localLoginEnabled: provider === 'local' || provider === 'hybrid',
    securityParameterKeys: [...LOGIN_SECURITY_PARAMETER_KEYS],
  };
}
