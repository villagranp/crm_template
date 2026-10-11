import { ApiError } from '@/services/api/api-error';

/**
 * Lectura de los `409 POSSIBLE_DUPLICATE` / `DUPLICATE_BLOCKED` de clientes y
 * contactos (02 §C.3, §F.3 `PossibleDuplicateErrorDetails`).
 *
 * El frontend no decide qué es un duplicado (lo decide el backend con
 * `crm.clientes.reglas_duplicidad` y `crm.contactos.reglas_duplicidad`): sólo
 * agrupa los candidatos que recibe para mostrarlos y reenviar la confirmación.
 */

export const DUPLICATE_ERROR_CODES = {
  possibleDuplicate: 'POSSIBLE_DUPLICATE',
  duplicateBlocked: 'DUPLICATE_BLOCKED',
} as const;

/** Motivo legible por máquina de una coincidencia (`details[].reason`). */
export type DuplicateReason = 'LEGAL_NAME' | 'TRADE_NAME' | 'EMAIL' | 'PHONE' | 'TAX_ID' | 'FULL_NAME';

/** Candidato agrupado: un mismo registro puede coincidir por varios motivos. */
export interface DuplicateCandidate {
  /** Clave estable para la lista (el id, o el código si el candidato no es visible). */
  key: string;
  /** `null` si el candidato está fuera del alcance del usuario (RN-02.15). */
  id: string | null;
  title: string;
  /** Datos de apoyo para distinguirlo (código de cliente, país, responsable, cargo…). */
  details: string[];
  isVisible: boolean;
  isDeleted: boolean;
  /** Motivos conocidos, sin repetir y en el orden en que llegaron. */
  reasons: DuplicateReason[];
}

const KNOWN_REASONS: readonly DuplicateReason[] = ['LEGAL_NAME', 'TRADE_NAME', 'EMAIL', 'PHONE', 'TAX_ID', 'FULL_NAME'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toReason(value: unknown): DuplicateReason | null {
  return KNOWN_REASONS.find((reason) => reason === value) ?? null;
}

interface ParsedEntry {
  key: string;
  id: string | null;
  title: string;
  details: string[];
  isVisible: boolean;
  isDeleted: boolean;
}

/** Candidato de cliente (F.3): `{ id|null, crmCode, customerCode|null, legalName, country, salesOwnerName, isVisible, isDeleted }`. */
function parseCustomerCandidate(candidate: Record<string, unknown>): ParsedEntry | null {
  const legalName = text(candidate.legalName);
  if (!legalName) {
    return null;
  }
  const id = text(candidate.id);
  const crmCode = text(candidate.crmCode);
  const country = isRecord(candidate.country) ? text(candidate.country.name) : null;
  const customerCode = text(candidate.customerCode);
  const owner = text(candidate.salesOwnerName);
  return {
    key: id ?? crmCode ?? legalName,
    id,
    title: crmCode ? `${crmCode} · ${legalName}` : legalName,
    details: [
      customerCode ? `Código de cliente ${customerCode}` : null,
      country,
      owner ? `Responsable: ${owner}` : null,
    ].filter((detail): detail is string => detail !== null),
    isVisible: candidate.isVisible !== false && id !== null,
    isDeleted: candidate.isDeleted === true,
  };
}

/**
 * Candidato de contacto: `{ id, fullName, jobTitle|null, isDeleted }`. Los
 * contactos se comparan dentro del mismo cliente, que el usuario ya ve.
 */
function parseContactCandidate(candidate: Record<string, unknown>): ParsedEntry | null {
  const fullName = text(candidate.fullName);
  if (!fullName) {
    return null;
  }
  const id = text(candidate.id);
  const jobTitle = text(candidate.jobTitle);
  return {
    key: id ?? fullName,
    id,
    title: fullName,
    details: jobTitle ? [jobTitle] : [],
    isVisible: candidate.isVisible !== false && id !== null,
    isDeleted: candidate.isDeleted === true,
  };
}

/** Agrupa `details` por candidato, conservando el orden de llegada. Ignora entradas mal formadas. */
export function parseDuplicateCandidates(details: readonly unknown[]): DuplicateCandidate[] {
  const byKey = new Map<string, DuplicateCandidate>();

  for (const detail of details) {
    if (!isRecord(detail) || !isRecord(detail.candidate)) {
      continue;
    }
    const entry = parseCustomerCandidate(detail.candidate) ?? parseContactCandidate(detail.candidate);
    if (!entry) {
      continue;
    }
    const reason = toReason(detail.reason);
    const existing = byKey.get(entry.key);
    if (existing) {
      if (reason && !existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      continue;
    }
    byKey.set(entry.key, { ...entry, reasons: reason ? [reason] : [] });
  }

  return [...byKey.values()];
}

/** `true` si el error es un aviso o bloqueo por posible duplicado. */
export function isDuplicateError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.code === DUPLICATE_ERROR_CODES.possibleDuplicate || error.code === DUPLICATE_ERROR_CODES.duplicateBlocked)
  );
}

/**
 * Ids que se reenvían en `acknowledgedDuplicateIds` al confirmar. Los
 * candidatos fuera del alcance llegan sin id (RN-02.15) y no se pueden enviar.
 */
export function acknowledgeableIds(candidates: readonly DuplicateCandidate[]): string[] {
  return candidates.flatMap((candidate) => (candidate.id ? [candidate.id] : []));
}
