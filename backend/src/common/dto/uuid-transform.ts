import type { TransformFnParams } from 'class-transformer';

/**
 * `@Transform(toLowerCaseUuid)` para los campos UUID del cuerpo o de la consulta: los
 * identificadores se comparan en memoria (asesor, cliente, país, oportunidad…) y
 * PostgreSQL los devuelve siempre en minúsculas, así que la API los normaliza al
 * entrar (03 "Precisiones", Revisión E5, m1). `@IsUUID` acepta ambas formas, de modo
 * que la validación no cambia. Admite listas (`each: true`); cualquier otro valor
 * pasa intacto para que lo rechace su validador.
 */
export function toLowerCaseUuid({ value }: TransformFnParams): unknown {
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) return value.map((item: unknown) => (typeof item === 'string' ? item.toLowerCase() : item));
  return value;
}
