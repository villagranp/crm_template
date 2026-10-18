import type { AuthenticatedPrincipal } from './authenticated-principal';

export const PRINCIPAL_ADMISSION = Symbol('PRINCIPAL_ADMISSION');

/** Lo que la admisión necesita saber de la petición (para auditar y trazar, nunca para decidir). */
export interface AdmissionContext {
  readonly correlationId: string;
  readonly ipAddress: string | null;
}

/**
 * Puerto de admisión (ADR-027): tras verificar el token, decide si la identidad autenticada
 * tiene cuenta local. Con proveedores que ya vinculan por sí mismos (`local`) no hace nada;
 * con Entra ID crea la cuenta del primer ingreso o rechaza con `403` y un código estable
 * (`IDENTITY_NOT_LINKED`, `IDENTITY_INCOMPLETE`, `SSO_PROVISIONING_DISABLED`).
 *
 * Que un token sea válido no implica que la identidad tenga cuenta: autenticar no es autorizar.
 */
export interface PrincipalAdmission {
  admit(principal: AuthenticatedPrincipal, context: AdmissionContext): Promise<void>;
}
