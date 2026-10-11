import { randomUUID } from 'node:crypto';

/**
 * Reglas puras de los adjuntos (ADR-021, 00 §2.11, 02 RN-02.29). Sin
 * infraestructura: las prueba `attachment-policy.spec.ts`.
 */

/** Tipos de dueño (DC-2): una FK nulable por tipo en `attachments`. */
export const ATTACHMENT_OWNER_TYPES = ['customer', 'project', 'visit', 'visitEvent', 'activity'] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

/**
 * Dueño de un adjunto. La autorización sobre el dueño (permiso + visibilidad +
 * política de edición) la decide **el módulo que llama** antes de invocar a
 * `AttachmentsService`; este solo garantiza que cada operación queda dentro del dueño.
 */
export interface AttachmentOwner {
  readonly type: AttachmentOwnerType;
  readonly id: string;
}

/** `stored_files.file_name` (VARCHAR 255). */
export const ATTACHMENT_FILE_NAME_MAX_LENGTH = 255;
/** `attachments.description` (VARCHAR 300); los DTO de subida usan `@MaxLength` con esta constante. */
export const ATTACHMENT_DESCRIPTION_MAX_LENGTH = 300;
/** Nombre que se guarda si, tras sanear, no queda nada. */
export const FALLBACK_FILE_NAME = 'archivo';

const BYTES_PER_MB = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rangos de puntos de código que se eliminan: controles C0/C1, marcas de
 * dirección y separadores de línea (pueden disfrazar la extensión, `foo<RLO>fdp.exe`).
 * Se declaran como números para no depender de caracteres invisibles en el fuente.
 */
const UNSAFE_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200e, 0x200f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
/** Caracteres que no se admiten en un nombre de archivo en Windows ni en `Content-Disposition`. */
const RESERVED_CHARACTERS = /["*:<>?|]/g;

export function isAttachmentOwnerType(value: string): value is AttachmentOwnerType {
  return (ATTACHMENT_OWNER_TYPES as readonly string[]).includes(value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** `crm.adjuntos.max_mb` → bytes (MiB, igual que `client_max_body_size 10m` de NGINX). */
export function maxBytesFromMegabytes(megabytes: number): number {
  return Math.floor(megabytes * BYTES_PER_MB);
}

/**
 * Nombre original saneado, **solo** para mostrar y para `Content-Disposition`
 * (ADR-021). Nunca forma parte de la ruta de almacenamiento.
 *
 * - Se queda con el último segmento (descarta cualquier ruta `a/b\c`).
 * - Quita controles, marcas de dirección y reservados; colapsa espacios.
 * - Quita puntos y espacios iniciales/finales (`..`, `archivo.pdf.`).
 * - Máximo 255 caracteres conservando la extensión.
 */
export function sanitizeAttachmentFileName(raw: string): string {
  const lastSegment = raw.normalize('NFC').split(/[/\\]/).pop() ?? '';
  const cleaned = lastSegment
    .split('')
    .filter((character) => !isUnsafeCharacter(character))
    .join('')
    .replace(RESERVED_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');

  if (cleaned.length === 0) {
    return FALLBACK_FILE_NAME;
  }
  return truncatePreservingExtension(cleaned, ATTACHMENT_FILE_NAME_MAX_LENGTH);
}

/** Extensión en minúsculas sin el punto (`pdf`), o `''` si no tiene. */
export function fileExtensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/**
 * Clave de almacenamiento generada por el servidor: `<año>/<mes>/<uuid>` en UTC
 * (ADR-021). No contiene el nombre ni la extensión del usuario.
 */
export function newStorageKey(now: Date = new Date(), id: string = randomUUID()): string {
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${id}`;
}

/** Descripción opcional: recortada; vacía → `null`. La longitud la valida antes el DTO del dueño. */
export function normalizeAttachmentDescription(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function isUnsafeCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return UNSAFE_CODE_POINT_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

function truncatePreservingExtension(name: string, maxLength: number): string {
  // Se cuenta por puntos de código para no partir un carácter (emoji, acentos compuestos).
  const characters = [...name];
  if (characters.length <= maxLength) {
    return name;
  }
  const extension = fileExtensionOf(name);
  // Una extensión absurdamente larga no se conserva: no es una extensión real.
  if (extension.length === 0 || extension.length > 16) {
    return characters.slice(0, maxLength).join('').trimEnd();
  }
  const suffix = `.${[...name].slice(-extension.length).join('')}`;
  const stem = characters.slice(0, maxLength - suffix.length).join('').trimEnd();
  return `${stem}${suffix}`;
}
