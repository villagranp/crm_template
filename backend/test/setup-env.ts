import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { INTEGRATION_SCHEMA, integrationDatabaseUrl } from './support/integration-database';
import { INTEGRATION_ENV, TEST_JWT_SECRET } from './support/integration-env';

// Se ejecuta antes de importar AppModule en cada archivo de pruebas: la
// configuración se valida al cargar el módulo.
process.env.DATABASE_URL = integrationDatabaseUrl();
Object.assign(process.env, INTEGRATION_ENV);

const secret = process.env.JWT_ACCESS_TOKEN_SECRET ?? '';
if (Buffer.byteLength(secret) < 32) {
  process.env.JWT_ACCESS_TOKEN_SECRET = TEST_JWT_SECRET;
}

// Adjuntos (ADR-021): siempre en un directorio temporal propio del esquema de
// integración, nunca en la carpeta de desarrollo aunque `.env` defina otra.
process.env.ATTACHMENTS_STORAGE_PATH = join(tmpdir(), 'mi-cliente-ag-integration', INTEGRATION_SCHEMA, 'attachments');
