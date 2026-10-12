import { Inject, Injectable } from '@nestjs/common';

import type { ParameterCatalogReferences } from '@/common/ports/parameter-catalog-references.port';

import { applyRule, catalogReferencesOf, rulesReferencingCatalog } from './parameter-rules.registry';
import { PARAMETERS_REPOSITORY, type ParametersRepository } from './ports/parameters.repository.port';

/**
 * Implementación de `ParameterCatalogReferences` (RN-07.26): recorre las reglas
 * del registro que pueden referenciar el catálogo, lee su valor guardado y
 * devuelve las claves que usan el código. Un valor guardado que no cumple su
 * regla no bloquea (lo corrige `PATCH /parameters/{key}`; `ParameterReader`
 * ya cae a su defecto documentado).
 */
@Injectable()
export class ParameterCatalogReferencesService implements ParameterCatalogReferences {
  constructor(@Inject(PARAMETERS_REPOSITORY) private readonly repository: ParametersRepository) {}

  async parameterKeysUsing(catalogKey: string, code: string): Promise<string[]> {
    const keys: string[] = [];
    for (const rule of rulesReferencingCatalog(catalogKey)) {
      const parameter = await this.repository.findByKey(rule.key);
      if (!parameter) continue;
      const result = applyRule(rule, parameter.value);
      if (!result.ok) continue;
      const used = catalogReferencesOf(rule, result.value).some(
        (reference) => reference.catalogKey === catalogKey && reference.code === code,
      );
      if (used) keys.push(rule.key);
    }
    return keys;
  }
}
