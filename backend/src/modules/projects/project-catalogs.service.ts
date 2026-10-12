import { Injectable } from '@nestjs/common';

import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import type { CatalogItemRecord } from '@/modules/catalogs/ports/catalogs.repository.port';
import {
  catalogOrder,
  closedStageIds,
  finalPhaseIds,
  nonFinalPhaseIds,
  openStageIds,
  type SemanticCatalogItem,
} from '@/modules/commercial-metrics/metric-definitions';

import { openStageRanking } from './project-commercial-status';
import { PROJECT_CATALOGS } from './project-constants';

/** Elemento de catálogo con su semántica, estado y orden de presentación. */
export interface ProjectCatalogItem extends SemanticCatalogItem {
  readonly isActive: boolean;
  readonly sortOrder: number;
}

/** Fases y etapas con lo que el módulo necesita para filtrar en SQL sin leer la `metadata` allí (RN-03.77). */
export interface PhaseAndStageSemantics {
  /** Todas las fases (activas o no), por `metadata.order`. */
  readonly phases: readonly ProjectCatalogItem[];
  readonly stages: readonly ProjectCatalogItem[];
  readonly nonFinalPhaseIds: readonly string[];
  readonly finalPhaseIds: readonly string[];
  readonly openStageIds: readonly string[];
  readonly closedStageIds: readonly string[];
  /** DEF-B: etapas abiertas por rango de desempate. */
  readonly openStageRanking: readonly string[];
  /** Fases por `metadata.order` (y `code`), para el orden `phaseOrder`. */
  readonly phaseRanking: readonly string[];
}

function toItem(item: CatalogItemRecord): ProjectCatalogItem {
  return {
    id: item.id,
    code: item.code,
    label: item.label,
    metadata: item.metadata as Readonly<Record<string, unknown>> | null,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  };
}

function byOrder(a: ProjectCatalogItem, b: ProjectCatalogItem): number {
  return catalogOrder(a) - catalogOrder(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

/**
 * Lectura de los catálogos con semántica del módulo (00 §3.3). La semántica se pregunta
 * siempre con los predicados de `metric-definitions.ts` (RN-03.77): incluye los
 * elementos desactivados, porque registros viejos pueden seguir usándolos.
 */
@Injectable()
export class ProjectCatalogsService {
  constructor(private readonly catalogs: CatalogLookupService) {}

  async items(catalogKey: string): Promise<ProjectCatalogItem[]> {
    const catalog = await this.catalogs.findByKey(catalogKey);
    return (catalog?.items ?? []).map(toItem);
  }

  async activeItems(catalogKey: string): Promise<ProjectCatalogItem[]> {
    return (await this.items(catalogKey)).filter((item) => item.isActive);
  }

  async phaseAndStageSemantics(): Promise<PhaseAndStageSemantics> {
    const [phases, stages] = await Promise.all([this.items(PROJECT_CATALOGS.phase), this.items(PROJECT_CATALOGS.stage)]);
    const sortedPhases = [...phases].sort(byOrder);
    const sortedStages = [...stages].sort(byOrder);
    return {
      phases: sortedPhases,
      stages: sortedStages,
      nonFinalPhaseIds: nonFinalPhaseIds(sortedPhases),
      finalPhaseIds: finalPhaseIds(sortedPhases),
      openStageIds: openStageIds(sortedStages),
      closedStageIds: closedStageIds(sortedStages),
      openStageRanking: openStageRanking(sortedStages),
      phaseRanking: sortedPhases.map((phase) => phase.id),
    };
  }
}
