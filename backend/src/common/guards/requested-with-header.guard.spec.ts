import type { ExecutionContext } from '@nestjs/common';

import { AccessDeniedError } from '@/common/errors/application-error';

import { RequestedWithHeaderGuard } from './requested-with-header.guard';

/** Node entrega las cabeceras con el nombre en minúsculas: así llegan al guard. */
function contextWith(headers: Record<string, string | string[]>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function rejectionOf(headers: Record<string, string | string[]>): unknown {
  try {
    new RequestedWithHeaderGuard().canActivate(contextWith(headers));
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('RequestedWithHeaderGuard (G-20)', () => {
  it('deja pasar X-Requested-With: XMLHttpRequest', () => {
    expect(new RequestedWithHeaderGuard().canActivate(contextWith({ 'x-requested-with': 'XMLHttpRequest' }))).toBe(true);
  });

  it.each([
    ['sin la cabecera', {}],
    ['con otro valor', { 'x-requested-with': 'fetch' }],
    ['con el valor en minúsculas', { 'x-requested-with': 'xmlhttprequest' }],
    ['vacía', { 'x-requested-with': '' }],
    ['con espacios', { 'x-requested-with': ' XMLHttpRequest ' }],
    ['repetida', { 'x-requested-with': ['XMLHttpRequest', 'XMLHttpRequest'] }],
  ])('rechaza %s con 403 CSRF_HEADER_REQUIRED', (_name, headers) => {
    const error = rejectionOf(headers);

    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(error).toMatchObject({
      code: 'CSRF_HEADER_REQUIRED',
      message: 'Esta operación exige la cabecera X-Requested-With: XMLHttpRequest',
    });
  });
});
