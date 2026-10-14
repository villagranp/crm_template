import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { httpStatusOf } from '@/common/filters/all-exceptions.filter';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AppRequest } from '@/common/types/request-context';

/**
 * Registra un evento estructurado por request: metodo, ruta, status y duracion.
 * No registra body ni headers: pueden contener datos sensibles (SECURITY.md).
 *
 * Los errores de aplicacion no traen status HTTP: lo decide `AllExceptionsFilter`
 * despues de este interceptor. Para no registrar `500` en respuestas
 * `401`/`404`/`422`, el status de un error sale de `httpStatusOf`, la misma
 * funcion con la que responde el filtro (una sola fuente de verdad). Se registra
 * siempre, tambien si el cliente corta la conexion antes de recibir la respuesta.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response.statusCode, startedAt),
        // El filtro global responde despues de este punto: se registra el
        // mismo status que el va a enviar, no uno deducido aqui por separado.
        error: (error: unknown) => this.log(request, httpStatusOf(error), startedAt),
      }),
    );
  }

  private log(request: AppRequest, statusCode: number, startedAt: bigint): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    this.logger.info('http_request', {
      correlationId: request.correlationId,
      method: request.method,
      path: request.route?.path ?? request.originalUrl.split('?')[0],
      statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      principalId: request.principal?.subjectId,
    });
  }
}
