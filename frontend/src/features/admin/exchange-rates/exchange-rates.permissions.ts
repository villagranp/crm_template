/**
 * Permisos de «Tipos de cambio» (07 E.5, H.1, RN-07.44). Los tipos de cambio
 * forman parte de F-46 y usan los permisos de parámetros: no hay permisos propios.
 */
export const EXCHANGE_RATE_PERMISSIONS = {
  /** Consultar tipos de cambio y monedas. */
  view: 'parametros.ver',
  /** Registrar y corregir tipos de cambio. */
  configure: 'parametros.configurar',
} as const;
