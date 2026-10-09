/**
 * Entorno fijo de las pruebas de integración. Son valores de prueba, no
 * secretos: el esquema se crea y se destruye en cada ejecución.
 */
export const INTEGRATION_ENV = {
  NODE_ENV: 'test',
  AUTH_PROVIDER: 'local',
  LOG_LEVEL: 'fatal',
  JWT_ISSUER: 'mi-cliente-ag-test',
  JWT_AUDIENCE: 'mi-cliente-ag-api-test',
  AUTH_DEFAULT_PASSWORD: 'contrasena-inicial-de-pruebas',
  SEED_ADMIN_EMAIL: 'admin@integration.test',
  SEED_ADMIN_PASSWORD: 'admin-inicial-pruebas',
} as const;

/** Clave HS256 de pruebas (≥ 32 bytes). En CI llega TEST_JWT_SECRET por el entorno. */
export const TEST_JWT_SECRET = 'clave-de-pruebas-de-integracion-0123456789abcdef';
