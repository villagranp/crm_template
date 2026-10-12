import { Inject, Injectable } from '@nestjs/common';

import { CATALOGS_REPOSITORY, type CatalogDetailRecord, type CatalogsRepository } from './ports/catalogs.repository.port';

/**
 * Lectura de catálogos por `key` para otros módulos (07 F.9, 00 §11): validación de
 * referencias en parámetros y, más adelante, opciones de formulario (D-07.12).
 *
 * Búsqueda exacta por clave en el puerto (`findByKey`). Sin caché: un cambio en
 * Catálogos se ve en la siguiente lectura (RN-07.35).
 */
@Injectable()
export class CatalogLookupService {
  constructor(@Inject(CATALOGS_REPOSITORY) private readonly repository: CatalogsRepository) {}

  findByKey(catalogKey: string): Promise<CatalogDetailRecord | null> {
    return this.repository.findByKey(catalogKey);
  }

  /**
   * `code → isActive` de los elementos del catálogo, o `null` si el catálogo no existe.
   */
  async itemStates(catalogKey: string): Promise<ReadonlyMap<string, boolean> | null> {
    const catalog = await this.findByKey(catalogKey);
    return catalog ? new Map(catalog.items.map((item) => [item.code, item.isActive])) : null;
  }
}
