import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '@/common/types/request-context';

export const CorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AppRequest>().correlationId,
);
