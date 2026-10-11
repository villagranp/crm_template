import type { ArgumentsHost } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { RequestValidationError } from '@/common/errors/application-error';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { flattenValidationErrors, VALIDATION_FAILED, validationExceptionFactory } from './validation-exception.factory';

const ERRORS: ValidationError[] = [
  { property: 'label', value: 'secreto', constraints: { isString: 'label must be a string' }, children: [] },
  {
    property: 'metadata',
    children: [{ property: 'order', constraints: { isInt: 'order must be an integer' }, children: [] }],
  },
];

describe('validationExceptionFactory (DC-6)', () => {
  it('aplana el árbol en { field, issue } sin incluir valores', () => {
    expect(flattenValidationErrors(ERRORS)).toEqual([
      { field: 'label', issue: 'label must be a string' },
      { field: 'metadata.order', issue: 'order must be an integer' },
    ]);
  });

  it('el filtro global responde 400 VALIDATION_FAILED con details[]', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ correlationId: 'corr-1', originalUrl: '/api/v1/x' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter({ error: jest.fn() } as unknown as AppLogger).catch(validationExceptionFactory(ERRORS), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: VALIDATION_FAILED,
      message: 'Request validation failed',
      details: [
        { field: 'label', issue: 'label must be a string' },
        { field: 'metadata.order', issue: 'order must be an integer' },
      ],
      correlationId: 'corr-1',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('secreto');
  });

  it('un RequestValidationError de un servicio responde también 400 VALIDATION_FAILED', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ correlationId: 'corr-2', originalUrl: '/api/v1/x' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter({ error: jest.fn() } as unknown as AppLogger).catch(
      new RequestValidationError('The value does not have a valid format', [{ field: 'email', code: VALIDATION_FAILED }]),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: VALIDATION_FAILED }));
  });
});
