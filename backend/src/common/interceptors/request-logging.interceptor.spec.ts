import { type ArgumentsHost, type CallHandler, type ExecutionContext, ForbiddenException, HttpStatus } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';

import {
  AccessDeniedError,
  AuthenticationFailedError,
  BusinessRuleViolationError,
  PayloadTooLargeError,
  PermissionDeniedError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { RequestLoggingInterceptor } from './request-logging.interceptor';

const REQUEST = { correlationId: 'corr-1', method: 'POST', originalUrl: '/api/v1/auth/refresh?x=1', route: { path: '/api/v1/auth/refresh' } };

function loggerMock(): AppLogger & { info: jest.Mock; error: jest.Mock } {
  return { info: jest.fn(), error: jest.fn() } as unknown as AppLogger & { info: jest.Mock; error: jest.Mock };
}

function executionContext(response: { statusCode: number }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => REQUEST, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

/** Status que el filtro global envía al cliente para `exception`. */
function statusSentByFilter(exception: unknown): number {
  const status = jest.fn(() => ({ json: jest.fn() }));
  const host = {
    switchToHttp: () => ({ getRequest: () => REQUEST, getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter(loggerMock()).catch(exception, host);
  return (status.mock.calls[0] as unknown as [number])[0];
}

/** Status que el interceptor registra en `http_request` cuando el handler lanza `exception`. */
async function statusLoggedFor(exception: unknown): Promise<number> {
  const logger = loggerMock();
  const handler: CallHandler = { handle: () => throwError(() => exception) };

  await expect(
    lastValueFrom(new RequestLoggingInterceptor(logger).intercept(executionContext({ statusCode: HttpStatus.OK }), handler)),
  ).rejects.toBe(exception);

  expect(logger.info).toHaveBeenCalledTimes(1);
  const [event, context] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
  expect(event).toBe('http_request');
  return context['statusCode'] as number;
}

describe('RequestLoggingInterceptor', () => {
  it('registra el status de la respuesta cuando el handler termina bien', async () => {
    const logger = loggerMock();
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(new RequestLoggingInterceptor(logger).intercept(executionContext({ statusCode: HttpStatus.CREATED }), handler));

    expect(logger.info).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({ correlationId: 'corr-1', method: 'POST', path: '/api/v1/auth/refresh', statusCode: 201 }),
    );
  });

  // Regresión: un ApplicationError no tiene `status` y se registraba como 500
  // aunque el cliente recibiera 401/404/422; los 500 del log no tenían
  // `unhandled_exception` porque no eran errores del servidor.
  it.each([
    ['AuthenticationFailedError', 401, new AuthenticationFailedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token')],
    ['ResourceNotFoundError', 404, new ResourceNotFoundError('Customer', 'c-1')],
    ['ResourceConflictError', 409, new ResourceConflictError('Conflict')],
    ['PermissionDeniedError', 403, new PermissionDeniedError('visitas.cerrar')],
    ['AccessDeniedError', 403, new AccessDeniedError('ACCOUNT_DISABLED', 'Disabled')],
    ['BusinessRuleViolationError', 422, new BusinessRuleViolationError('RULE', 'Rule')],
    ['RequestValidationError', 400, new RequestValidationError('Invalid')],
    ['PayloadTooLargeError', 413, new PayloadTooLargeError('TOO_LARGE', 'Too large')],
    ['HttpException', 403, new ForbiddenException()],
    ['Error no controlado', 500, new Error('boom')],
    ['valor que no es Error', 500, 'boom'],
  ])('%s: registra %i, el mismo status que envía el filtro global', async (_name, expected, exception) => {
    const logged = await statusLoggedFor(exception);

    expect(logged).toBe(expected);
    expect(logged).toBe(statusSentByFilter(exception));
  });
});
