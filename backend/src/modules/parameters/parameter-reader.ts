import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { applyRule, ruleFor } from './parameter-rules.registry';
import { PARAMETERS_REPOSITORY, type ParametersRepository } from './ports/parameters.repository.port';

export interface ParameterReading<T> {
  value: T;
  /** `false` si el valor guardado falta o no cumple la regla: `value` es el defecto documentado. */
  valid: boolean;
  source: 'stored' | 'default';
}

/**
 * Lector tipado de parámetros para los módulos (02 F.6.5, 07 F.9, 00 §11).
 *
 * - Valida con la **misma** regla del registro que `PATCH /parameters/{key}`
 *   (`parameter-rules.registry.ts`) y devuelve el valor ya interpretado y
 *   normalizado (número, booleano, objeto…).
 * - Valor ausente o ilegible (introducido por fuera de la API) → valor por defecto
 *   documentado y `warn` estructurado con la clave, sin el valor; nunca un `500`
 *   (RN-07.35, AC-07.33). Quien necesite distinguirlo (p. ej. Inicio desactiva la
 *   alerta, 01 RN-01.30) usa `read()`, que informa `valid`.
 * - **Sin caché** (DC-3): cada llamada lee la base, así que un cambio hecho con
 *   `PATCH /parameters/{key}` rige en la siguiente operación (PF-07.41).
 * - Las referencias a catálogos no se revalidan aquí (lectura barata); las protege
 *   el bloqueo de desactivación del servicio de catálogos (RN-07.26).
 *
 * Solo admite claves registradas: leer una clave sin regla es un error de programación.
 */
@Injectable()
export class ParameterReader {
  constructor(
    @Inject(PARAMETERS_REPOSITORY) private readonly repository: ParametersRepository,
    private readonly logger: AppLogger,
  ) {}

  async get<T = unknown>(key: string): Promise<T> {
    return (await this.read<T>(key)).value;
  }

  async read<T = unknown>(key: string): Promise<ParameterReading<T>> {
    const rule = ruleFor(key);
    if (!rule) {
      throw new Error(`Parameter ${key} has no rule in parameter-rules.registry.ts`);
    }

    const parameter = await this.repository.findByKey(key);
    if (parameter) {
      const result = applyRule(rule, parameter.value);
      if (result.ok) {
        return { value: result.value as T, valid: true, source: 'stored' };
      }
      this.logger.warn('parameter_invalid_value', {
        key,
        reason: 'invalid',
        issues: result.issues.map((issue) => issue.field),
      });
    } else {
      this.logger.warn('parameter_invalid_value', { key, reason: 'missing' });
    }

    const fallback = applyRule(rule, rule.defaultValue);
    if (!fallback.ok) {
      // El defecto documentado debe cumplir su regla (lo verifica parameter-rules.registry.spec.ts).
      throw new Error(`Default value of parameter ${key} does not satisfy its rule`);
    }
    return { value: fallback.value as T, valid: false, source: 'default' };
  }
}
