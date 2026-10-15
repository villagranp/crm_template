/**
 * Transformaciones de entrada de los DTO del módulo (class-transformer). Las
 * genéricas viven en `@/common/dto/dto-transforms` y se reexportan para los
 * DTO del propio módulo.
 */

export { isPresent, toOptionalBoolean, trim, trimToNull } from '@/common/dto/dto-transforms';

/** Tope de candidatos que se pueden confirmar en una petición (02 F.3). */
export const MAX_ACKNOWLEDGED_DUPLICATES = 50;
