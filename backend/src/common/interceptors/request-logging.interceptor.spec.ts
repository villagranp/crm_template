import { EventEmitter } from 'node:events';

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';

import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { RequestLoggingInterceptor } from './request-logging.interceptor';

function setup() {
  const logger = { info: jest.fn() } as unknown as AppLogger & { info: jest.Mock };
  const interceptor = new RequestLoggingInterceptor(logger);
  const request = {
    correlationId: 'corr-1',
    method: 'GET',
    route: { path: '/api/v1/customers/:id' },
    originalUrl: '/api/v1/customers/abc?x=1',
    principal: { subjectId: 'user-1' },
  };
  const response = Object.assign(new EventEmitter(), { statusCode: 200 });
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { logger, interceptor, response, context };
}

describe('RequestLoggingInterceptor', () => {
  it('registra el status real enviado al terminar la respuesta', async () => {
    const { logger, interceptor, response, context } = setup();
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(context, handler));
    expect(logger.info).not.toHaveBeenCalled();

    response.statusCode = 201;
    response.emit('finish');

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({
        correlationId: 'corr-1',
        method: 'GET',
        path: '/api/v1/customers/:id',
        statusCode: 201,
        principalId: 'user-1',
      }),
    );
  });

  it('un error de aplicación se registra con el status que puso el filtro (404), no con 500', async () => {
    const { logger, interceptor, response, context } = setup();
    const handler: CallHandler = { handle: () => throwError(() => new ResourceNotFoundError('Cliente', 'abc')) };

    await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toBeInstanceOf(ResourceNotFoundError);

    // AllExceptionsFilter fija el status después del interceptor.
    response.statusCode = 404;
    response.emit('finish');

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][1]).toMatchObject({ statusCode: 404 });
  });

  it('registra una sola vez aunque la respuesta emita finish de nuevo', async () => {
    const { logger, interceptor, response, context } = setup();
    await lastValueFrom(interceptor.intercept(context, { handle: () => of(null) }));

    response.emit('finish');
    response.emit('finish');

    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
