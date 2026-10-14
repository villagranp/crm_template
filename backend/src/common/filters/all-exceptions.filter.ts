import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AccessDeniedError,
  ApplicationError,
  AuthenticationFailedError,
  BusinessRuleViolationError,
  PayloadTooLargeError,
  PermissionDeniedError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
  ServiceUnavailableError,
} from '@/common/errors/application-error';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AppRequest } from '@/common/types/request-context';
import type { ErrorResponseDto } from '@/common/dto/error-response.dto';

/**
 * Status HTTP con el que la API responde a `exception`. Es la unica regla de
 * traduccion: la usan este filtro y el log `http_request`
 * (RequestLoggingInterceptor), que asi registra el status real de la respuesta.
 * Un `ApplicationError` no lleva `status` propio; deducirlo de esa propiedad lo
 * registraba como 500 aunque el cliente recibiera 401, 404 o 422.
 */
export function httpStatusOf(exception: unknown): number {
  if (exception instanceof ApplicationError) {
    if (exception instanceof ResourceNotFoundError) return HttpStatus.NOT_FOUND;
    if (exception instanceof ResourceConflictError) return HttpStatus.CONFLICT;
    if (exception instanceof AuthenticationFailedError) return HttpStatus.UNAUTHORIZED;
    if (exception instanceof PermissionDeniedError || exception instanceof AccessDeniedError) return HttpStatus.FORBIDDEN;
    if (exception instanceof BusinessRuleViolationError) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (exception instanceof RequestValidationError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof PayloadTooLargeError) return HttpStatus.PAYLOAD_TOO_LARGE;
    if (exception instanceof ServiceUnavailableError) return HttpStatus.SERVICE_UNAVAILABLE;
    return HttpStatus.BAD_REQUEST;
  }
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Traduce cualquier excepcion al formato unico de error de la API.
 * Nunca expone stack traces, SQL ni detalles internos (API-STANDARDS.md seccion 8).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();

    const { statusCode, code, message, details } = this.toErrorShape(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error('unhandled_exception', {
        correlationId: request.correlationId,
        path: request.originalUrl.split('?')[0],
        errorName: exception instanceof Error ? exception.name : 'UnknownError',
        errorMessage: exception instanceof Error ? exception.message : undefined,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    const body: ErrorResponseDto = {
      statusCode,
      code,
      message,
      details,
      correlationId: request.correlationId,
    };

    response.status(statusCode).json(body);
  }

  private toErrorShape(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details: ReadonlyArray<Record<string, unknown>>;
  } {
    if (exception instanceof ApplicationError) {
      return {
        statusCode: httpStatusOf(exception),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = httpStatusOf(exception);
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        const rawMessage = record['message'];
        const rawDetails = record['details'];
        // `details` explícito (p. ej. `validationExceptionFactory`, DC-6) tiene prioridad;
        // si no, el `message[]` por defecto de Nest se convierte en `{ issue }`.
        const details: ReadonlyArray<Record<string, unknown>> = Array.isArray(rawDetails)
          ? rawDetails.filter((detail): detail is Record<string, unknown> => typeof detail === 'object' && detail !== null)
          : Array.isArray(rawMessage)
            ? rawMessage.map((issue) => ({ issue: String(issue) }))
            : [];

        return {
          statusCode: status,
          code: typeof record['code'] === 'string' ? record['code'] : this.defaultCodeFor(status),
          message: Array.isArray(rawMessage)
            ? 'Request validation failed'
            : typeof rawMessage === 'string'
              ? rawMessage
              : exception.message,
          details,
        };
      }

      return {
        statusCode: status,
        code: this.defaultCodeFor(status),
        message: typeof payload === 'string' ? payload : exception.message,
        details: [],
      };
    }

    // Error no controlado: no se filtra nada del detalle interno al cliente.
    return {
      statusCode: httpStatusOf(exception),
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: [],
    };
  }

  private defaultCodeFor(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
      [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE_VIOLATION',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
    };
    return codes[status] ?? 'INTERNAL_ERROR';
  }
}
