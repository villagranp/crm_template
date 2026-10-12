/**
 * Reglas de duplicados blandos (02 F.6.4, RN-02.14, RN-02.16, DM-4, DM-5).
 *
 * Funciones puras: interpretan el parámetro (`crm.clientes.reglas_duplicidad`,
 * `crm.contactos.reglas_duplicidad`) y clasifican las coincidencias que encuentra
 * el repositorio en avisos (`AVISAR`) y bloqueos (`BLOQUEAR`). La búsqueda de
 * coincidencias la hace el adaptador con los índices de 00.
 */

export const DUPLICATE_RULE_ACTIONS = ['NO', 'AVISAR', 'BLOQUEAR'] as const;
export type DuplicateAction = (typeof DUPLICATE_RULE_ACTIONS)[number];

/** Claves de `crm.clientes.reglas_duplicidad` (D-02.4). */
export const CUSTOMER_DUPLICATE_RULE_KEYS = ['razonSocialNormalizada', 'nombreComercialNormalizado', 'correo', 'telefono', 'nit'] as const;
export type CustomerDuplicateRuleKey = (typeof CUSTOMER_DUPLICATE_RULE_KEYS)[number];

/** Claves de `crm.contactos.reglas_duplicidad` (DM-5). `correo` siempre bloquea (índice único). */
export const CONTACT_DUPLICATE_RULE_KEYS = ['nombreCompleto', 'telefono', 'correo'] as const;
export type ContactDuplicateRuleKey = (typeof CONTACT_DUPLICATE_RULE_KEYS)[number];

/** Motivo legible por máquina de cada regla (02 F.3 `reason`). */
export const CUSTOMER_DUPLICATE_REASONS: Readonly<Record<CustomerDuplicateRuleKey, string>> = {
  razonSocialNormalizada: 'LEGAL_NAME',
  nombreComercialNormalizado: 'TRADE_NAME',
  correo: 'EMAIL',
  telefono: 'PHONE',
  nit: 'TAX_ID',
};

export const CONTACT_DUPLICATE_REASONS: Readonly<Record<Exclude<ContactDuplicateRuleKey, 'correo'>, string>> = {
  nombreCompleto: 'FULL_NAME',
  telefono: 'PHONE',
};

/** Acciones que admite cada clave restringida: el NIT nunca bloquea (DM-4). */
export const CUSTOMER_RESTRICTED_ACTIONS: Readonly<Partial<Record<CustomerDuplicateRuleKey, readonly DuplicateAction[]>>> = {
  nit: ['AVISAR', 'NO'],
};

export interface DuplicateRuleWarning {
  readonly key: string;
  readonly reason: 'UNKNOWN_KEY' | 'INVALID_ACTION' | 'ACTION_NOT_ALLOWED';
}

export interface ParsedDuplicateRules<TKey extends string> {
  /** Acción de cada clave admitida; las no configuradas valen `NO`. */
  readonly rules: Readonly<Record<TKey, DuplicateAction>>;
  /** Para el log (sin valores): claves desconocidas, acciones inválidas o no permitidas. */
  readonly warnings: readonly DuplicateRuleWarning[];
}

export interface ParseDuplicateRulesOptions<TKey extends string> {
  /** Acciones permitidas por clave. Un valor fuera de la lista se degrada a `fallback`. */
  readonly restrictedActions?: Readonly<Partial<Record<TKey, readonly DuplicateAction[]>>>;
  /** Acción que se aplica cuando el valor de una clave restringida no está permitido. Por defecto `AVISAR`. */
  readonly fallback?: DuplicateAction;
  /** Acciones forzadas, que el parámetro no puede relajar (correo de contacto = `BLOQUEAR`). */
  readonly forced?: Readonly<Partial<Record<TKey, DuplicateAction>>>;
}

function isDuplicateAction(value: unknown): value is DuplicateAction {
  return typeof value === 'string' && (DUPLICATE_RULE_ACTIONS as readonly string[]).includes(value);
}

/**
 * Interpreta el valor del parámetro: `{ clave: 'NO' | 'AVISAR' | 'BLOQUEAR' }`.
 *
 * - Clave desconocida → se ignora con advertencia (RN-02.14).
 * - Acción no reconocida → la clave queda en `NO` con advertencia.
 * - Clave restringida (`nit`) con una acción no permitida (`BLOQUEAR`) → `fallback`
 *   (`AVISAR`) con advertencia: nunca bloquea (DM-4).
 * - Claves forzadas (`correo` de contactos) → siempre su acción (RN-02.16).
 */
export function parseDuplicateRules<TKey extends string>(
  value: unknown,
  allowedKeys: readonly TKey[],
  options: ParseDuplicateRulesOptions<TKey> = {},
): ParsedDuplicateRules<TKey> {
  const rules = Object.fromEntries(allowedKeys.map((key) => [key, 'NO'])) as Record<TKey, DuplicateAction>;
  const warnings: DuplicateRuleWarning[] = [];
  const input = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  for (const [key, action] of Object.entries(input)) {
    if (!(allowedKeys as readonly string[]).includes(key)) {
      warnings.push({ key, reason: 'UNKNOWN_KEY' });
      continue;
    }
    const typedKey = key as TKey;
    if (!isDuplicateAction(action)) {
      warnings.push({ key, reason: 'INVALID_ACTION' });
      continue;
    }
    const allowed = options.restrictedActions?.[typedKey];
    if (allowed && !allowed.includes(action)) {
      warnings.push({ key, reason: 'ACTION_NOT_ALLOWED' });
      rules[typedKey] = options.fallback ?? 'AVISAR';
      continue;
    }
    rules[typedKey] = action;
  }

  for (const [key, action] of Object.entries(options.forced ?? {}) as [TKey, DuplicateAction][]) {
    rules[key] = action;
  }

  return { rules, warnings };
}

/** Coincidencia de un candidato con una regla. */
export interface DuplicateMatch<TKey extends string, TCandidate> {
  readonly rule: TKey;
  readonly candidate: TCandidate;
}

export interface DuplicateEvaluation<TKey extends string, TCandidate> {
  /** Reglas en `AVISAR`: se pueden confirmar. */
  readonly warnings: readonly DuplicateMatch<TKey, TCandidate>[];
  /** Reglas en `BLOQUEAR`: no se pueden confirmar. */
  readonly blocking: readonly DuplicateMatch<TKey, TCandidate>[];
}

/**
 * Clasifica las coincidencias según la acción de su regla. `NO` las descarta.
 * Un mismo candidato puede aparecer con varias reglas; si una bloquea, la
 * operación se bloquea (precedencia `BLOQUEAR` > `AVISAR` > `NO`).
 */
export function evaluateDuplicates<TKey extends string, TCandidate>(
  rules: Readonly<Record<TKey, DuplicateAction>>,
  matches: readonly DuplicateMatch<TKey, TCandidate>[],
): DuplicateEvaluation<TKey, TCandidate> {
  const warnings: DuplicateMatch<TKey, TCandidate>[] = [];
  const blocking: DuplicateMatch<TKey, TCandidate>[] = [];
  for (const match of matches) {
    const action = rules[match.rule] ?? 'NO';
    if (action === 'BLOQUEAR') blocking.push(match);
    else if (action === 'AVISAR') warnings.push(match);
  }
  return { warnings, blocking };
}

/** Reglas activas (distintas de `NO`): las únicas que el repositorio necesita buscar. */
export function activeRuleKeys<TKey extends string>(rules: Readonly<Record<TKey, DuplicateAction>>): TKey[] {
  return (Object.entries(rules) as [TKey, DuplicateAction][]).filter(([, action]) => action !== 'NO').map(([key]) => key);
}

/**
 * Confirmación de avisos (RN-02.14, aclaración de 2026-10-11): la confirmación es
 * la **presencia** de `acknowledgedDuplicateIds` (puede ser `[]`) y debe incluir
 * todos los candidatos **visibles**; los no visibles (`id = null`) quedan
 * confirmados por la presencia del campo. Devuelve `true` si los avisos quedan confirmados.
 */
export function areWarningsAcknowledged(
  warningCandidateIds: readonly (string | null)[],
  acknowledgedIds: readonly string[] | undefined,
): boolean {
  if (warningCandidateIds.length === 0) return true;
  if (acknowledgedIds === undefined) return false;
  const acknowledged = new Set(acknowledgedIds);
  return warningCandidateIds.every((id) => id === null || acknowledged.has(id));
}
