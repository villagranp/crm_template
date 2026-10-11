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

/** 409. `code` permite distinguir el conflicto (`ROLE_IN_USE`, `LAST_ADMIN`…). */
export class ResourceConflictError extends ApplicationError {
  readonly code: string;

  constructor(
    message: string,
    details: ReadonlyArray<Record<string, unknown>> = [],
    code = 'RESOURCE_CONFLICT',
  ) {
    super(message, details);
    this.code = code;
  }
}

/** 401: la credencial presentada no autentica. El código lo decide quien lanza. */
export class AuthenticationFailedError extends ApplicationError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 403 con un código propio, cuando no se trata de un permiso `recurso.accion`
 * (`ADMIN_ONLY`, `FIELD_NOT_EDITABLE` con `details[].field`…).
 */
export class AccessDeniedError extends ApplicationError {
  readonly code: string;

  constructor(code: string, message: string, details: ReadonlyArray<Record<string, unknown>> = []) {
    super(message, details);
    this.code = code;
  }
}

export class PermissionDeniedError extends ApplicationError {
  readonly code = 'PERMISSION_DENIED';

  constructor(permission: string) {
    super('Insufficient permissions', [{ requiredPermission: permission }]);
  }
}

/**
 * 413: el archivo o el cuerpo supera el tamaño admitido (API-STANDARDS §3). El
 * código lo decide quien lanza (`ATTACHMENT_TOO_LARGE`, DC-4).
 */
export class PayloadTooLargeError extends ApplicationError {
  readonly code: string;

  constructor(code: string, message: string, details: ReadonlyArray<Record<string, unknown>> = []) {
    super(message, details);
    this.code = code;
  }
}
