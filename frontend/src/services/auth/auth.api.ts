import { httpClient } from '@/services/api/http-client';

import type { AuthenticatedUser, PasswordChangeInput, SignInCredentials } from './auth-provider';

/**
 * Llamadas al módulo de autenticación local (PLAN-AUTH-LOCAL §3).
 *
 * La cookie de refresco es `HttpOnly` y de ruta `/api/v1/auth`: la gestiona el
 * navegador y este código nunca la ve. Sólo `/auth/password/change` lleva el
 * access token; el resto son públicos porque su credencial es el cuerpo o la
 * cookie.
 */

export interface SessionResponse {
  accessToken: string;
  /** ISO 8601: caducidad del access token. */
  expiresAt: string;
  passwordChangeRequired: boolean;
  user: Required<Pick<AuthenticatedUser, 'id' | 'email' | 'displayName' | 'roles' | 'permissions'>>;
}

export const AUTH_ERROR_CODES = {
  invalidCredentials: 'INVALID_CREDENTIALS',
  accountDisabled: 'ACCOUNT_DISABLED',
  invalidRefreshToken: 'INVALID_REFRESH_TOKEN',
  invalidCurrentPassword: 'INVALID_CURRENT_PASSWORD',
  passwordPolicyViolation: 'PASSWORD_POLICY_VIOLATION',
} as const;

export function login(credentials: SignInCredentials): Promise<SessionResponse> {
  return httpClient.post<SessionResponse>('/auth/login', {
    isPublic: true,
    body: { email: credentials.email, password: credentials.password },
  });
}

export function refreshSession(): Promise<SessionResponse> {
  return httpClient.post<SessionResponse>('/auth/refresh', { isPublic: true });
}

/** Público: debe funcionar aunque el access token ya haya caducado. */
export function logout(): Promise<void> {
  return httpClient.post<void>('/auth/logout', { isPublic: true });
}

/**
 * Cambia la contraseña propia. Lo invoca el proveedor con el cerrojo de
 * renovación tomado, por eso desactiva el reintento automático tras un `401`.
 */
export function changePassword(input: PasswordChangeInput): Promise<SessionResponse> {
  return httpClient.post<SessionResponse>('/auth/password/change', {
    body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
    skipSessionRefresh: true,
  });
}
