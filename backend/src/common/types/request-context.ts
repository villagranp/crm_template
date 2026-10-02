import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

/**
 * Request enriquecida con el contexto transversal de la aplicacion.
 * El correlationId lo coloca CorrelationIdMiddleware; el principal, AuthenticationGuard.
 */
export interface AppRequest extends Request {
  correlationId: string;
  principal?: AuthenticatedPrincipal;
}
