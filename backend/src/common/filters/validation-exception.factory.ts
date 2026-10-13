import { BadRequestException, ValidationPipe, type ValidationError, type ValidationPipeOptions } from '@nestjs/common';

/** Código estable de los errores del `ValidationPipe` (DC-6, API-STANDARDS §8). */
export const VALIDATION_FAILED = 'VALIDATION_FAILED';

export interface ValidationIssue {
  field: string;
  issue: string;
}

const ARRAY_INDEX = /^\d+$/;

/**
 * Aplana el árbol de `ValidationError` de class-validator en `{ field, issue }`.
 * `field` es la ruta con puntos para los objetos y corchetes para los índices de una
 * lista (`items[0].code`), el mismo formato que los `422` de reglas de negocio
 * (API-STANDARDS §8). Nunca incluye el valor recibido: podría ser un dato sensible
 * (SECURITY.md).
 */
export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const error of errors) {
    const field = !parentPath
      ? error.property
      : ARRAY_INDEX.test(error.property)
        ? `${parentPath}[${error.property}]`
        : `${parentPath}.${error.property}`;
    for (const message of Object.values(error.constraints ?? {})) {
      issues.push({ field, issue: message });
    }
    if (error.children && error.children.length > 0) {
      issues.push(...flattenValidationErrors(error.children, field));
    }
  }
  return issues;
}

/** `exceptionFactory` del `ValidationPipe`: `400 VALIDATION_FAILED` con `details[]`. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: VALIDATION_FAILED,
    message: 'Request validation failed',
    details: flattenValidationErrors(errors),
  });
}

/**
 * Opciones únicas del `ValidationPipe` global. `main.ts` y el arranque de las
 * pruebas de integración (`test/support/test-app.ts`) usan exactamente estas.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: validationExceptionFactory,
};

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe(VALIDATION_PIPE_OPTIONS);
}
