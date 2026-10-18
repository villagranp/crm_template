/**
 * Entorno de las pruebas de integración del SSO con Microsoft Entra ID (ADR-027).
 *
 * Se importa **primero** en la suite, antes de cualquier módulo de la aplicación: la configuración se
 * valida al cargar `AppModule`, y `setup-env.ts` fija `AUTH_PROVIDER=local` para el resto de las
 * suites. Cada archivo de Jest tiene su propio `process.env`, así que esto no afecta a las demás.
 *
 * Son valores de prueba, no secretos ni identificadores de un tenant real. Nada llama a Microsoft.
 */
export const ENTRA_TEST = {
  tenantId: '4b1f0e6a-2d9c-4a57-9b0e-5f3a7c1d2e80',
  clientId: '7c2d9a41-6e3b-4f08-8a15-0d9b4e7f1c63',
  audience: 'api://mi-cliente-ag-integration',
  scope: 'access_as_user',
  issuer: 'https://login.microsoftonline.com/4b1f0e6a-2d9c-4a57-9b0e-5f3a7c1d2e80/v2.0',
} as const;

process.env.AUTH_PROVIDER = 'entra';
process.env.ENTRA_TENANT_ID = ENTRA_TEST.tenantId;
process.env.ENTRA_CLIENT_ID = ENTRA_TEST.clientId;
process.env.ENTRA_AUDIENCE = ENTRA_TEST.audience;
process.env.ENTRA_AUTHORITY = ENTRA_TEST.issuer;
// ADR-027 (M1): se aplican siempre que estén configurados. La SPA de prueba es `clientId`.
process.env.ENTRA_REQUIRED_SCOPE = ENTRA_TEST.scope;
process.env.ENTRA_ALLOWED_CLIENT_IDS = ENTRA_TEST.clientId;
