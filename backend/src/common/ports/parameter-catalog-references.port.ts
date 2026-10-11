export const PARAMETER_CATALOG_REFERENCES = Symbol('PARAMETER_CATALOG_REFERENCES');

/**
 * Qué parámetros del sistema usan un código de catálogo (RN-07.26, D-07.6).
 *
 * Puerto neutral entre `catalogs` y `parameters`: lo consume `CatalogsService`
 * (no se desactiva un código que usa un parámetro) y lo implementa el módulo de
 * parámetros, que es quien conoce el registro de reglas y los valores guardados
 * (`ParameterCatalogReferencesService`, enlazado en `ParametersCoreModule`). Así
 * `catalogs` no importa nada de `parameters` y `parameters` puede seguir leyendo
 * catálogos con `CatalogLookupService` sin ciclo.
 */
export interface ParameterCatalogReferences {
  /**
   * Claves de los parámetros cuyo valor guardado (y válido) referencia el código
   * `code` del catálogo `catalogKey`. Vacío si ninguno lo usa.
   */
  parameterKeysUsing(catalogKey: string, code: string): Promise<string[]>;
}
