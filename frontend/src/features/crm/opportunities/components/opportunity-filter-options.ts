import type { OpportunityFormOptions } from '../opportunities.api';
import { outcomeLabel } from '../opportunity-format';

/**
 * Opciones y utilidades de los filtros del pipeline (03 §E.7): listas desde
 * `form-options` y filtros repetibles separados por comas ("Precisiones" E1).
 */

const LIST_SEPARATOR = ',';

export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinList(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(LIST_SEPARATOR) : undefined;
}

export interface Choice {
  value: string;
  label: string;
}

export function stageChoices(options: OpportunityFormOptions | undefined): Choice[] {
  return (options?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.label }));
}

/** Conjunto cerrado de resultados (DM-15), con las etiquetas del catálogo. */
export function outcomeChoices(options: OpportunityFormOptions | undefined): Choice[] {
  return (['WON', 'PARTIAL', 'LOST'] as const).map((code) => ({ value: code, label: outcomeLabel(code, options?.outcomes) }));
}
