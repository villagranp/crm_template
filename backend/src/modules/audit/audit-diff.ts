/**
 * Diferencia entre dos estados de un recurso, para `audit_logs.changes`
 * (PLAN-ADMIN, D11). Formato: `{ campo: { before, after } }`, solo con lo que
 * cambió.
 *
 * Nunca incluye campos sensibles aunque el llamador los pase por descuido: la
 * auditoría se exporta y se consulta, y un hash o un token ahí sería una fuga.
 */

export type AuditValue = string | number | boolean | null | AuditValue[];

export type AuditChanges = Record<string, { before: AuditValue; after: AuditValue }>;

const SENSITIVE_FIELD = /pass|hash|token|secret|credential/i;

function normalize(value: unknown): AuditValue {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    // Las listas (roles, permisos) se comparan como conjuntos: el orden no es un cambio.
    return value.map(normalize).sort((a, b) => String(a).localeCompare(String(b)));
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

/** Marcador de un valor enmascarado (DM-29). */
export const AUDIT_MASK = '***';

export interface AuditDiffOptions {
  /**
   * Campos con datos personales (DM-29, 00 §4.5): se registra que cambiaron,
   * con ambos valores enmascarados. El cambio se detecta sobre los valores reales.
   */
  readonly maskedFields?: readonly string[];
}

/**
 * Enmascara un valor para la auditoría (DM-29): correo `a***@d***.com`, otro
 * texto `A***` (solo la primera letra), números y booleanos `***`. Un valor vacío
 * o nulo se conserva (que antes no hubiera dato no es un dato personal).
 */
export function maskAuditValue(value: AuditValue): AuditValue {
  if (value === null || value === '') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(maskAuditValue);
  }
  if (typeof value !== 'string') {
    return AUDIT_MASK;
  }
  const at = value.indexOf('@');
  if (at > 0 && at < value.length - 1) {
    return `${maskText(value.slice(0, at))}@${maskDomain(value.slice(at + 1))}`;
  }
  return maskText(value);
}

function maskText(text: string): string {
  const first = [...text.trim()][0];
  return first ? `${first}${AUDIT_MASK}` : AUDIT_MASK;
}

/** `dominio.com` → `d***.com`; sin punto → `d***`. Conserva solo el dominio de primer nivel. */
function maskDomain(domain: string): string {
  const dot = domain.lastIndexOf('.');
  return dot > 0 ? `${maskText(domain.slice(0, dot))}${domain.slice(dot)}` : maskText(domain);
}

export function auditDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  options: AuditDiffOptions = {},
): AuditChanges {
  const changes: AuditChanges = {};
  const masked = new Set(options.maskedFields ?? []);
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const field of fields) {
    if (SENSITIVE_FIELD.test(field)) {
      continue;
    }
    const previous = normalize(before?.[field]);
    const next = normalize(after?.[field]);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changes[field] = masked.has(field)
        ? { before: maskAuditValue(previous), after: maskAuditValue(next) }
        : { before: previous, after: next };
    }
  }

  return changes;
}
