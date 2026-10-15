/**
 * Mensajes propios de «Productos y unidades» por código (se pasan como
 * `overrides` a `describeApiError`). Los códigos nuevos del módulo
 * (`UNIT_DIMENSION_LOCKED`…) ya tienen mensaje común en `admin-api.ts`.
 */
export const PRODUCT_FORM_ERRORS = {
  family: { RESOURCE_CONFLICT: 'Ya existe una familia con ese código.' },
  product: {
    RESOURCE_CONFLICT: 'Ya existe un producto con ese SKU.',
    UNKNOWN_REFERENCE:
      'La familia o la unidad base elegida ya no existe o está inactiva. Actualiza y vuelve a intentarlo.',
  },
  unit: { RESOURCE_CONFLICT: 'Ya existe una unidad con ese código.' },
} as const satisfies Record<string, Readonly<Record<string, string>>>;
