import type { SemanticCatalogItem } from '@/modules/commercial-metrics/metric-definitions';
import type { ParameterReading } from '@/modules/parameters/parameter-reader';

/**
 * Reglas de las alertas de Inicio (01 D.6, RN-01.26–RN-01.30). Funciones puras: el
 * servicio lee los parámetros `crm.alertas.*` en cada petición (sin caché) y el
 * catálogo `crm.prioridad`, y aquí se decide qué tipos están activos, con qué
 * umbral y con qué prioridad. Un parámetro ausente o inválido desactiva **solo**
 * su tipo; nunca se inventa un umbral.
 */

export const ALERT_TYPE_CODES = ['ACTIVIDAD_VENCIDA', 'VISITA_SIN_CONFIRMAR', 'PROYECTO_SIN_ACTUALIZAR', 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION'] as const;
export type AlertType = (typeof ALERT_TYPE_CODES)[number];

export const ALERT_PARAMETERS = {
  unconfirmedVisitHours: 'crm.alertas.visita_sin_confirmar_horas',
  staleProjectDays: 'crm.alertas.proyecto_sin_actualizar_dias',
  opportunityWithoutNextAction: 'crm.alertas.oportunidad_sin_siguiente_accion',
  priorities: 'crm.alertas.prioridades',
} as const;

/** Permiso `.ver` de la entidad de origen de cada tipo (01 H.1, RN-01.31). */
export const ALERT_SOURCE_PERMISSIONS: Readonly<Record<AlertType, string>> = {
  ACTIVIDAD_VENCIDA: 'actividades.ver',
  VISITA_SIN_CONFIRMAR: 'visitas.ver',
  PROYECTO_SIN_ACTUALIZAR: 'proyectos.ver',
  OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'oportunidades.ver',
};

export type AlertDisabledReason = 'DISABLED_BY_PARAMETER' | 'PARAMETER_INVALID';

export interface AlertPriority {
  readonly code: string;
  readonly label: string;
  readonly weight: number;
}

export interface AlertTypeRule {
  readonly type: AlertType;
  readonly enabled: boolean;
  readonly disabledReason: AlertDisabledReason | null;
  readonly priority: AlertPriority | null;
  /** Umbral en horas (AL-2) o días (AL-3); `null` en los tipos sin umbral. */
  readonly threshold: number | null;
}

export interface AlertParameterReadings {
  readonly unconfirmedVisitHours: ParameterReading<number>;
  readonly staleProjectDays: ParameterReading<number>;
  readonly opportunityWithoutNextAction: ParameterReading<boolean>;
  readonly priorities: ParameterReading<Readonly<Record<string, string>>>;
}

export interface AlertRulesResult {
  readonly rules: Readonly<Record<AlertType, AlertTypeRule>>;
  /** Claves de parámetro inválidas, para el `warn` del servicio (sin valores). */
  readonly invalidParameters: readonly string[];
}

function weightOf(item: SemanticCatalogItem): number | null {
  const weight = item.metadata?.['weight'];
  return typeof weight === 'number' && Number.isFinite(weight) ? weight : null;
}

/** Prioridad de un tipo: código de `crm.alertas.prioridades` → elemento de `crm.prioridad` con `weight` (RN-01.27). */
export function resolvePriority(code: string | undefined, priorities: readonly SemanticCatalogItem[]): AlertPriority | null {
  if (!code) return null;
  const item = priorities.find((candidate) => candidate.code === code);
  const weight = item ? weightOf(item) : null;
  return item && weight !== null ? { code: item.code, label: item.label, weight } : null;
}

export function evaluateAlertRules(readings: AlertParameterReadings, priorityItems: readonly SemanticCatalogItem[]): AlertRulesResult {
  const invalid = new Set<string>();
  const prioritiesValid = readings.priorities.valid;
  if (!prioritiesValid) invalid.add(ALERT_PARAMETERS.priorities);

  const build = (type: AlertType, threshold: { reading: ParameterReading<number>; key: string } | null): AlertTypeRule => {
    const priority = prioritiesValid ? resolvePriority(readings.priorities.value[type], priorityItems) : null;
    if (prioritiesValid && !priority) invalid.add(ALERT_PARAMETERS.priorities);
    if (threshold && !threshold.reading.valid) invalid.add(threshold.key);
    const thresholdInvalid = threshold !== null && !threshold.reading.valid;
    const ok = priority !== null && !thresholdInvalid;
    return {
      type,
      enabled: ok,
      disabledReason: ok ? null : 'PARAMETER_INVALID',
      priority,
      threshold: threshold && threshold.reading.valid ? threshold.reading.value : null,
    };
  };

  const rules: Record<AlertType, AlertTypeRule> = {
    ACTIVIDAD_VENCIDA: build('ACTIVIDAD_VENCIDA', null),
    VISITA_SIN_CONFIRMAR: build('VISITA_SIN_CONFIRMAR', { reading: readings.unconfirmedVisitHours, key: ALERT_PARAMETERS.unconfirmedVisitHours }),
    PROYECTO_SIN_ACTUALIZAR: build('PROYECTO_SIN_ACTUALIZAR', { reading: readings.staleProjectDays, key: ALERT_PARAMETERS.staleProjectDays }),
    OPORTUNIDAD_SIN_SIGUIENTE_ACCION: build('OPORTUNIDAD_SIN_SIGUIENTE_ACCION', null),
  };

  // AL-4 solo existe si su parámetro vale `true` (D.6).
  const flag = readings.opportunityWithoutNextAction;
  if (!flag.valid) {
    invalid.add(ALERT_PARAMETERS.opportunityWithoutNextAction);
    rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION = { ...rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION, enabled: false, disabledReason: 'PARAMETER_INVALID' };
  } else if (flag.value !== true && rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION.enabled) {
    rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION = { ...rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION, enabled: false, disabledReason: 'DISABLED_BY_PARAMETER' };
  }
  return { rules, invalidParameters: [...invalid] };
}
