import { Inject, Injectable } from '@nestjs/common';

import { CATALOGS_REPOSITORY, type CatalogDetailRecord, type CatalogsRepository } from './ports/catalogs.repository.port';

/** Página máxima al buscar un catálogo por clave (la búsqueda es por subcadena). */
const LOOKUP_PAGE_SIZE = 100;

/**
 * Lectura de catálogos por `key` para otros módulos (07 F.9, 00 §11): validación de
 * referencias en parámetros y, más adelante, opciones de formulario (D-07.12).
 *
 * Resuelve la clave con el puerto existente (`list` con búsqueda + coincidencia
 * exacta, luego `findById`). Sin caché: un cambio en Catálogos se ve en la
 * siguiente lectura (RN-07.35).
 */
@Injectable()
export class CatalogLookupService {
  constructor(@Inject(CATALOGS_REPOSITORY) private readonly repository: CatalogsRepository) {}

  async findByKey(catalogKey: string): Promise<CatalogDetailRecord | null> {
    const page = await this.repository.list({
      page: 1,
      pageSize: LOOKUP_PAGE_SIZE,
      sortBy: 'key',
      sortOrder: 'asc',
      search: catalogKey,
    });
    const match = page.items.find((catalog) => catalog.key === catalogKey);
    return match ? this.repository.findById(match.id) : null;
  }

  /**
   * `code → isActive` de los elementos del catálogo, o `null` si el catálogo no existe.
   */
  async itemStates(catalogKey: string): Promise<ReadonlyMap<string, boolean> | null> {
    const catalog = await this.findByKey(catalogKey);
    return catalog ? new Map(catalog.items.map((item) => [item.code, item.isActive])) : null;
  }
}
