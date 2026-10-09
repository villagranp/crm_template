import { z } from 'zod';

import type { CatalogItemMetadata } from './catalogs.api';

/** Mismas reglas que los DTO del backend; la validación aquí es de experiencia de usuario. */
const CATALOG_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const ITEM_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MAX_METADATA_BYTES = 4096;

export const catalogFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Escribe una clave.')
    .max(80, 'Usa como máximo 80 caracteres.')
    .regex(CATALOG_KEY_PATTERN, 'Sólo minúsculas, dígitos, punto, guion y guion bajo, sin espacios.'),
  name: z.string().trim().min(1, 'Escribe un nombre.').max(120, 'Usa como máximo 120 caracteres.'),
  description: z.string().trim().max(400, 'Usa como máximo 400 caracteres.'),
});

export type CatalogFormValues = z.infer<typeof catalogFormSchema>;

/**
 * Texto del campo `metadata` a objeto. Vacío = `null`. Devuelve `undefined` si
 * no es un objeto JSON válido o supera el tamaño permitido.
 */
export function parseMetadata(text: string): CatalogItemMetadata | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return new TextEncoder().encode(JSON.stringify(value)).length <= MAX_METADATA_BYTES
      ? (value as CatalogItemMetadata)
      : undefined;
  } catch {
    return undefined;
  }
}

export function formatMetadata(metadata: CatalogItemMetadata | null): string {
  return metadata ? JSON.stringify(metadata) : '';
}

const metadataField = z
  .string()
  .refine((text) => parseMetadata(text) !== undefined, `Debe ser un objeto JSON, p. ej. {"color": "azul"} (máx. ${MAX_METADATA_BYTES} bytes).`);

export const itemFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Escribe un código.')
    .max(60, 'Usa como máximo 60 caracteres.')
    .regex(ITEM_CODE_PATTERN, 'Sólo letras, dígitos, punto, guion y guion bajo.'),
  label: z.string().trim().min(1, 'Escribe una etiqueta.').max(160, 'Usa como máximo 160 caracteres.'),
  metadata: metadataField,
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;
