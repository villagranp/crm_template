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
  UnsupportedMediaTypeError,
} from '@/common/errors/application-error';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AppRequest } from '@/common/types/request-context';
import type { ErrorResponseDto } from '@/common/dto/error-response.dto';

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
        statusCode: this.statusForApplicationError(exception),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
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
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: [],
    };
  }

  private statusForApplicationError(error: ApplicationError): number {
    if (error instanceof ResourceNotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ResourceConflictError) return HttpStatus.CONFLICT;
    if (error instanceof AuthenticationFailedError) return HttpStatus.UNAUTHORIZED;
    if (error instanceof PermissionDeniedError || error instanceof AccessDeniedError) return HttpStatus.FORBIDDEN;
    if (error instanceof BusinessRuleViolationError) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (error instanceof RequestValidationError) return HttpStatus.BAD_REQUEST;
    if (error instanceof PayloadTooLargeError) return HttpStatus.PAYLOAD_TOO_LARGE;
    if (error instanceof UnsupportedMediaTypeError) return HttpStatus.UNSUPPORTED_MEDIA_TYPE;
    return HttpStatus.BAD_REQUEST;
  }

  private defaultCodeFor(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
      [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
      [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE_VIOLATION',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
    };
    return codes[status] ?? 'INTERNAL_ERROR';
  }
}
