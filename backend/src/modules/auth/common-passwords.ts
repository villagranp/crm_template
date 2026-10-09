/**
 * Lista corta de contraseñas que no deben aceptarse (D7 del plan).
 *
 * No pretende ser exhaustiva: una lista completa son cientos de miles de
 * entradas y pertenece a un servicio aparte, no al bundle de la aplicación.
 * Esto corta lo trivial sin añadir una dependencia nueva.
 *
 * Se compara en minúsculas y sin espacios alrededor.
 *
 * Si el proyecto necesita cobertura real, la vía es consultar la API de rangos
 * de HaveIBeenPwned con k-anonimato (se envían 5 caracteres del hash SHA-1,
 * nunca la contraseña), y eso requiere su propio ADR por la llamada externa.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456789012',
  'contrasena123',
  'contraseña123',
  'password1234',
  'passwordpassword',
  'qwertyuiop12',
  'administrador',
  'administrador1',
  'micliente2026',
  'grupoag2026',
  'bienvenido123',
  'cambiameporfavor',
  'abcd12345678',
  'iloveyou1234',
  'letmein12345',
  '111111111111',
  'qwerty123456',
  'temporal1234',
  'default12345',
]);
