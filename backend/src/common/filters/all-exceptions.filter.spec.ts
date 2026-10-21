import { type ArgumentsHost, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import type { AppRequest } from '@/common/types/request-context';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { AllExceptionsFilter } from './all-exceptions.filter';

function setup(request: Partial<AppRequest>) {
  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter(logger as unknown as AppLogger);
  return { logger, status, json, host, filter };
}

const THROTTLED_REQUEST = {
  correlationId: 'corr-1',
  method: 'POST',
  route: { path: '/api/v1/customers/:id' },
  originalUrl: '/api/v1/customers/7d3c?search=secreto',
  ip: '203.0.113.9',
  headers: { authorization: 'Bearer abc', cookie: '__Secure-refresh_token=xyz' },
  body: { password: 'no' },
} as unknown as Partial<AppRequest>;

describe('AllExceptionsFilter · rate_limited (G-26)', () => {
  it('registra cada 429 como warn rate_limited con ruta plantilla, IP y correlationId, sin cabeceras ni cuerpo', () => {
    const { logger, status, json, host, filter } = setup(THROTTLED_REQUEST);

    filter.catch(new ThrottlerException(), host);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('rate_limited', {
      correlationId: 'corr-1',
      method: 'POST',
      path: '/api/v1/customers/:id',
      clientIp: '203.0.113.9',
      principalId: undefined,
    });
    const logged = JSON.stringify(logger.warn.mock.calls[0]);
    for (const leaked of ['7d3c', 'secreto', 'Bearer', 'xyz', 'password']) expect(logged).not.toContain(leaked);
    // La respuesta no cambia.
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429, code: 'RATE_LIMIT_EXCEEDED', correlationId: 'corr-1' }));
  });

  it('incluye el principal cuando el límite es por usuario (exportaciones)', () => {
    const { logger, host, filter } = setup({ ...THROTTLED_REQUEST, principal: { subjectId: 'user-1' } } as unknown as Partial<AppRequest>);

    filter.catch(new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS), host);

    expect(logger.warn).toHaveBeenCalledWith('rate_limited', expect.objectContaining({ principalId: 'user-1' }));
  });

  it('no registra rate_limited para otros errores', () => {
    const { logger, host, filter } = setup(THROTTLED_REQUEST);

    filter.catch(new NotFoundException(), host);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
