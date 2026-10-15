import { BusinessRuleViolationError } from '@/common/errors/application-error';
import { type DashboardCardsIssue } from '@/modules/parameters/dashboard-cards';

/**
 * Reglas puras de las preferencias de interfaz (Ajustes 1, RN-AJ1.16 y RN-AJ1.2).
 * Sin base de datos: las prueba `user-preferences.rules.spec.ts`.
 */

/** Temas admitidos (D-AJ1.7): solo `light` y `dark`; sin preferencia, `prefers-color-scheme`. */
export const THEME_VALUES = ['light', 'dark'] as const;
export type ThemeValue = (typeof THEME_VALUES)[number];

/** `422` de una composición con claves desconocidas, repetidas o faltantes (`details[].issue`). */
export const INVALID_DASHBOARD_CARDS = 'INVALID_DASHBOARD_CARDS';

export function isThemeValue(value: unknown): value is ThemeValue {
  return typeof value === 'string' && (THEME_VALUES as readonly string[]).includes(value);
}

/** El tema guardado, o `null` si no hay fila o el valor no es legible. */
export function themeFromStored(value: unknown): ThemeValue | null {
  return isThemeValue(value) ? value : null;
}

export function invalidDashboardCardsError(issues: readonly DashboardCardsIssue[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    INVALID_DASHBOARD_CARDS,
    'The dashboard composition is not valid',
    issues.map((issue) => ({
      field: issue.index === null ? issue.list : `${issue.list}.${issue.index}.key`,
      issue: issue.issue,
      key: issue.key,
    })),
  );
}
