import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { AppConfigService } from '@/config/app-config.service';
import type { AppRequest } from '@/common/types/request-context';

/** Formato aceptado para un correlation ID entrante: evita inyeccion en logs. */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Preserva el correlation ID entrante cuando es seguro; si no, genera uno nuevo.
 * Lo expone en la request y lo devuelve siempre en la respuesta (ADR-016).
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfigService) {}

  use(request: AppRequest, response: Response, next: NextFunction): void {
    const headerName = this.config.get('CORRELATION_ID_HEADER');
    const incoming = request.header(headerName);

    request.correlationId =
      typeof incoming === 'string' && SAFE_CORRELATION_ID.test(incoming) ? incoming : randomUUID();

    response.setHeader(headerName, request.correlationId);
    next();
  }
}
