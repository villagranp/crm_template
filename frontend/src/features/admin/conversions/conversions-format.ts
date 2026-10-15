import type { ConversionRule, ConversionScope } from './conversions.api';

export const SCOPE_LABELS: Readonly<Record<ConversionScope, string>> = {
  GLOBAL: 'Global',
  PRODUCT_FAMILY: 'Familia',
  PRODUCT: 'Producto',
  PROJECT_TYPE: 'Tipo de proyecto',
};

/** Chips del filtro de ámbito (`scope`); `''` = todos. */
export const SCOPE_FILTER_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'GLOBAL', label: SCOPE_LABELS.GLOBAL },
  { value: 'PRODUCT_FAMILY', label: SCOPE_LABELS.PRODUCT_FAMILY },
  { value: 'PRODUCT', label: SCOPE_LABELS.PRODUCT },
  { value: 'PROJECT_TYPE', label: SCOPE_LABELS.PROJECT_TYPE },
] as const;

/** Regla identidad (origen = destino): su factor no cambia. */
export function isIdentityRule(rule: ConversionRule): boolean {
  return rule.isIdentity;
}

/** Regla que no se desactiva ni cambia de factor (identidad de la unidad de tonelaje). */
export function isProtectedRule(rule: ConversionRule): boolean {
  return rule.isProtected;
}

/** Referencia legible del ámbito ("Acero", "VAR-3"…), o `null` en `GLOBAL`. */
export function scopeReference(rule: ConversionRule): string | null {
  switch (rule.scope) {
    case 'PRODUCT':
      return rule.product ? `${rule.product.sku} — ${rule.product.description}` : null;
    case 'PRODUCT_FAMILY':
      return rule.productFamily?.name ?? null;
    case 'PROJECT_TYPE':
      return rule.projectType?.label ?? null;
    case 'GLOBAL':
    default:
      return null;
  }
}

/** Factor sin ceros finales sobrantes (`"0.00100000"` → `"0.001"`), sin pasar por `number`. */
export function formatFactor(value: string): string {
  if (!value.includes('.')) {
    return value;
  }
  const trimmed = value.replace(/0+$/, '');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}
