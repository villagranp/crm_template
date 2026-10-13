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

/**
 * 400 `VALIDATION_FAILED` detectado por un servicio y no por el `ValidationPipe`
 * (p. ej. la validación compartida de clientes, 02 F.6.1): mismo status y código
 * que DC-6 para un mismo defecto de formato, venga de donde venga.
 */
export class RequestValidationError extends ApplicationError {
  readonly code = 'VALIDATION_FAILED';

  constructor(message: string, details: ReadonlyArray<Record<string, unknown>> = []) {
    super(message, details);
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

/**
 * 415: el tipo real del archivo no se admite o no coincide con su extensión
 * (API-STANDARDS §3, 06 D-06.13 y DC-4: `UNSUPPORTED_FILE_TYPE` de la carga masiva).
 */
export class UnsupportedMediaTypeError extends ApplicationError {
  readonly code: string;

  constructor(code: string, message: string, details: ReadonlyArray<Record<string, unknown>> = []) {
    super(message, details);
    this.code = code;
  }
}
