import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '@/common/types/request-context';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

/**
 * Inyecta el principal autenticado. Es undefined solo en endpoints @Public().
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    return request.principal;
  },
);
