import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api';

import { buildMetadata, metadataFieldLabel, toMetadataDraft } from './catalog-metadata';
import type { CatalogMetadataField } from './catalogs.api';
import { describeCatalogItemError } from './catalogs.errors';

/** Esquema de `crm.etapa_oportunidad` tal como lo publica el backend. */
const STAGE_SCHEMA: CatalogMetadataField[] = [
  { key: 'order', type: 'number', required: true, integer: true, min: 0, max: 1000 },
  { key: 'isClosed', type: 'boolean', required: true },
  { key: 'outcome', type: 'enum', required: false, nullable: true, values: ['WON', 'LOST'] },
  { key: 'inFunnel', type: 'boolean', required: true },
];

describe('toMetadataDraft', () => {
  it('lleva el metadata guardado a los controles y descarta lo que no declara el esquema', () => {
    expect(toMetadataDraft(STAGE_SCHEMA, { order: 30, isClosed: true, outcome: 'WON', legacy: 'x' })).toEqual({
      order: '30',
      isClosed: true,
      outcome: 'WON',
      inFunnel: false,
    });
    expect(
      toMetadataDraft([{ key: 'appliesTo', type: 'enum[]', required: true, values: ['WON'] }], null),
    ).toEqual({ appliesTo: [] });
  });
});

describe('buildMetadata', () => {
  it('convierte los controles en metadata con tipos (booleanos obligatorios siempre, null si se admite)', () => {
    expect(buildMetadata(STAGE_SCHEMA, { order: ' 40 ', isClosed: false, outcome: '', inFunnel: true })).toEqual({
      metadata: { order: 40, isClosed: false, outcome: null, inFunnel: true },
      errors: {},
    });
  });

  it('valida obligatorios, enteros y rangos como ayuda (el backend decide)', () => {
    expect(buildMetadata(STAGE_SCHEMA, { order: '', isClosed: false, outcome: '', inFunnel: false }).errors).toEqual({
      order: 'Obligatorio.',
    });
    expect(buildMetadata(STAGE_SCHEMA, { order: '2.5', isClosed: false, inFunnel: false }).errors).toEqual({
      order: 'Escribe un número entero.',
    });
    expect(buildMetadata(STAGE_SCHEMA, { order: '1001', isClosed: false, inFunnel: false }).errors).toEqual({
      order: 'Debe ser como mucho 1000.',
    });
    expect(
      buildMetadata([{ key: 'appliesTo', type: 'enum[]', required: true, values: ['WON', 'LOST'] }], { appliesTo: [] })
        .errors,
    ).toEqual({ appliesTo: 'Elige al menos uno.' });
  });

  it('booleanos opcionales sólo si se marcan; listas libres tal cual; esquema vacío = sin metadata', () => {
    const schema: CatalogMetadataField[] = [
      { key: 'isRescheduled', type: 'boolean', required: false },
      { key: 'fields', type: 'string[]', required: true },
    ];
    expect(buildMetadata(schema, { isRescheduled: false, fields: [] }).metadata).toEqual({ fields: [] });
    expect(buildMetadata(schema, { isRescheduled: true, fields: ['nextAction'] }).metadata).toEqual({
      isRescheduled: true,
      fields: ['nextAction'],
    });
    expect(buildMetadata([], {})).toEqual({ metadata: null, errors: {} });
  });

  it('etiqueta las claves conocidas y deja las demás por su nombre', () => {
    expect(metadataFieldLabel('isClosed')).toBe('Etapa cerrada');
    expect(metadataFieldLabel('otraClave')).toBe('otraClave');
  });
});

function apiError(statusCode: number, code: string, details: unknown[]): ApiError {
  return new ApiError({ statusCode, code, message: 'x', details });
}

describe('describeCatalogItemError', () => {
  it('INVALID_CATALOG_METADATA indica el campo', () => {
    expect(
      describeCatalogItemError(
        apiError(422, 'INVALID_CATALOG_METADATA', [{ field: 'metadata.isClosed', issue: 'Expected boolean' }]),
      ),
    ).toEqual({
      message: 'Los datos del valor no cumplen el formato de este catálogo.',
      details: ['Etapa cerrada: Expected boolean'],
    });
  });

  it('CATALOG_INVARIANT explica el motivo: conjunto cerrado, invariante o parámetro que lo usa', () => {
    expect(
      describeCatalogItemError(apiError(409, 'CATALOG_INVARIANT', [{ reason: 'closed_set', issue: 'x' }])).message,
    ).toMatch(/conjunto cerrado/i);
    expect(
      describeCatalogItemError(
        apiError(409, 'CATALOG_INVARIANT', [
          { reason: 'invariant', issue: 'Debe quedar al menos una etapa activa con outcome="WON"' },
        ]),
      ),
    ).toEqual({
      message: 'El cambio dejaría el catálogo incoherente.',
      details: ['Debe quedar al menos una etapa activa con outcome="WON"'],
    });
    expect(
      describeCatalogItemError(
        apiError(409, 'CATALOG_INVARIANT', [
          { reason: 'referenced_by_parameter', code: 'PROSPECTO', keys: ['crm.valores_por_defecto'] },
        ]),
      ),
    ).toEqual({
      message: 'Un parámetro del CRM usa este valor. Cambia primero el parámetro y vuelve a intentarlo.',
      details: ['Parámetros: crm.valores_por_defecto'],
    });
  });

  it('etiqueta duplicada: propone reactivar si el existente está inactivo', () => {
    expect(
      describeCatalogItemError(
        apiError(409, 'RESOURCE_CONFLICT', [{ field: 'label', issue: 'duplicated', existingIsActive: false }]),
      ).message,
    ).toBe('Ya existe un valor inactivo con esa etiqueta: reactívalo en lugar de crear otro.');
    expect(
      describeCatalogItemError(
        apiError(409, 'RESOURCE_CONFLICT', [{ field: 'label', issue: 'duplicated', existingIsActive: true }]),
      ).message,
    ).toBe('Ya existe un valor con esa etiqueta en este catálogo.');
    expect(
      describeCatalogItemError(apiError(409, 'RESOURCE_CONFLICT', [{ field: 'code', issue: 'duplicated' }])).message,
    ).toBe('Ya existe un elemento con ese código en este catálogo.');
  });
});
