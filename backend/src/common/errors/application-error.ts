/**
 * Errores de aplicacion/dominio. No dependen de HTTP: la traduccion a status code
 * ocurre en AllExceptionsFilter.
 */
export abstract class ApplicationError extends Error {
  abstract readonly code: string;

  protected constructor(
    message: string,
    readonly details: ReadonlyArray<Record<string, unknown>> = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ResourceNotFoundError extends ApplicationError {
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resource: string, identifier: string) {
    super(`${resource} not found`, [{ resource, identifier }]);
  }
}

export class BusinessRuleViolationError extends ApplicationError {
  readonly code: string;

  constructor(code: string, message: string, details: ReadonlyArray<Record<string, unknown>> = []) {
    super(message, details);
    this.code = code;
  }
}

export class ResourceConflictError extends ApplicationError {
  readonly code = 'RESOURCE_CONFLICT';

  constructor(message: string, details: ReadonlyArray<Record<string, unknown>> = []) {
    super(message, details);
  }
}

export class PermissionDeniedError extends ApplicationError {
  readonly code = 'PERMISSION_DENIED';

  constructor(permission: string) {
    super('Insufficient permissions', [{ requiredPermission: permission }]);
  }
}
