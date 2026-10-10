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

export function auditDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChanges {
  const changes: AuditChanges = {};
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const field of fields) {
    if (SENSITIVE_FIELD.test(field)) {
      continue;
    }
    const previous = normalize(before?.[field]);
    const next = normalize(after?.[field]);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changes[field] = { before: previous, after: next };
    }
  }

  return changes;
}
