/**
 * Aviso no bloqueante que acompaña a una respuesta correcta (`200`/`201`): la
 * operación se hizo, pero el usuario debe saber algo (p. ej. `EXCHANGE_RATE_STALE`,
 * 03 RN-03.81). **No** es un error ni cambia el status (CLAUDE.md §8.8 sigue
 * aplicando a los errores). Viaja en `warnings[]` de la respuesta de la mutación.
 *
 * `message` nunca repite datos personales; `details` lleva solo identificadores,
 * códigos, fechas y cifras.
 */
export interface ApplicationWarning {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}
