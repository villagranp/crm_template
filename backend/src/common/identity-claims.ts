/**
 * Utilidades puras de identidad compartidas por el proveedor de Entra ID (infraestructura), el módulo de
 * acceso, la carga por scripts y el registro de parámetros (ADR-027). Viven aquí para que la
 * infraestructura no dependa de un módulo de negocio.
 */

/** `oid` de Entra ID: un GUID (8-4-4-4-12 hexadecimales) en cualquier capitalización. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string): boolean {
  return GUID.test(value);
}

/** Forma canónica del `oid` guardado en `user_identities.subject`: minúsculas, como lo emite Entra ID. */
export function canonicalOid(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Caracteres de control y de formato que nunca deben llegar a un correo ni a un nombre: controles C0/C1,
 * ancho cero y marcas direccionales (U+200B–200F, U+202A–202E, U+2060–2069) y BOM (U+FEFF).
 */
export const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

/** Los mismos caracteres, sin el espacio, el tabulador y los saltos de línea que `trim()` ya recorta en los bordes. */
const FORBIDDEN_IN_EMAIL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

const EMAIL_MAX_LENGTH = 320;

/**
 * Correo ASCII imprimible: parte local de caracteres «atext» (RFC 5322) y dominio de etiquetas ASCII o
 * punycode (`xn--…`) separadas por puntos, con al menos un punto. No pretende validar toda la RFC.
 */
const EMAIL_SHAPE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Correo normalizado (recortado, en minúsculas) o `null` si no es utilizable: vacío, demasiado largo, con
 * caracteres de control, de formato, bidireccionales o de ancho cero, con caracteres no ASCII, sin forma de
 * correo, o el UPN de un invitado externo (`…#EXT#@…`), que no es un buzón.
 */
export function usableEmail(candidate: string | undefined): string | null {
  if (typeof candidate !== 'string' || FORBIDDEN_IN_EMAIL.test(candidate)) {
    return null;
  }
  const email = candidate.trim().toLowerCase();
  if (email.length < 5 || email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email) || email.includes('#ext#')) {
    return null;
  }
  return email;
}

/** `true` si el texto es el UPN de un invitado externo (contiene `#EXT#`, sin distinguir mayúsculas). */
export function isGuestUpn(candidate: unknown): boolean {
  return typeof candidate === 'string' && candidate.toLowerCase().includes('#ext#');
}

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Dominio en minúsculas y sin espacios, o `null` si no tiene forma de dominio (ASCII o punycode, con al menos un punto). */
export function canonicalDomain(value: string): string | null {
  const domain = value.trim().toLowerCase();
  return domain.length <= 253 && DOMAIN.test(domain) ? domain : null;
}

/**
 * Lista de dominios separados por comas, en forma canónica (minúsculas, sin repetidos, orden de aparición).
 * Los elementos que no son un dominio válido se omiten: una lista ilegible no autoriza a nadie por error.
 */
export function parseDomainList(value: string | null | undefined): string[] {
  const domains: string[] = [];
  for (const part of (value ?? '').split(',')) {
    const domain = canonicalDomain(part);
    if (domain && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return domains;
}

/**
 * ¿El dominio del correo está en la lista? Comparación sin distinguir mayúsculas y por dominio **exacto**:
 * `evil-somosgrupoag.com` y `somosgrupoag.com.evil.io` no coinciden con `somosgrupoag.com`, ni un
 * subdominio con su dominio padre. Lista vacía: nadie.
 */
export function isEmailDomainAllowed(email: string, allowedDomains: readonly string[]): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) {
    return false;
  }
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.includes(domain);
}
