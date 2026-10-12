import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';

import { type ProjectActor, ProjectAccessService } from './project-access.service';
import { HISTORY_DUPLICATED_AUDIT_EVENTS, PROJECT_AUDIT_EVENTS } from './project-audit';
import {
  type ProjectHistoryKind,
  type ProjectHistoryRecord,
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
  type UserRef,
} from './ports/projects.repository.port';

export type HistoryValue = string | number | boolean | null;

export interface HistoryChange {
  readonly field: string;
  readonly before: HistoryValue;
  readonly after: HistoryValue;
}

/** Entrada de la línea de tiempo (03 F.1 `ProjectHistoryEntryDto`). */
export interface ProjectHistoryEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actor: UserRef | null;
  readonly kind: ProjectHistoryKind;
  readonly event: string | null;
  readonly subject: ProjectHistoryRecord['subject'];
  readonly changes: readonly HistoryChange[];
  readonly comment: string | null;
}

function scalar(value: unknown): HistoryValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

/** Cambios de cada origen en la forma común `{ field, before, after }`. */
export function historyChanges(record: ProjectHistoryRecord): { event: string | null; changes: HistoryChange[] } {
  const payload = record.payload;
  switch (record.kind) {
    case 'PHASE':
      return {
        event: null,
        changes: [
          { field: 'phase', before: scalar(payload['fromPhase']), after: scalar(payload['toPhase']) },
          { field: 'progress', before: scalar(payload['fromProgress']), after: scalar(payload['toProgress']) },
        ],
      };
    case 'STAGE':
      return { event: null, changes: [{ field: 'stage', before: scalar(payload['fromStage']), after: scalar(payload['toStage']) }] };
    case 'RESULT':
      return {
        event: null,
        changes: ['action', 'outcome', 'reason', 'awardedPercent', 'decisionDate'].map((field) => ({
          field,
          before: null,
          after: scalar(payload[field]),
        })),
      };
    default: {
      const changes = payload['changes'];
      const entries =
        typeof changes === 'object' && changes !== null && !Array.isArray(changes) ? Object.entries(changes as Record<string, unknown>) : [];
      return {
        event: scalar(payload['event']) as string | null,
        changes: entries.map(([field, diff]) => {
          const pair = (typeof diff === 'object' && diff !== null ? diff : {}) as Record<string, unknown>;
          return { field, before: scalar(pair['before']), after: scalar(pair['after']) };
        }),
      };
    }
  }
}

/**
 * Historial de la ficha (03 F.1, AC-03.13): une, ordenado por fecha descendente y
 * paginado en el servidor, el historial de fase, de etapas y de resultados de sus
 * oportunidades y la auditoría del proyecto y de sus hijos. Las entradas de auditoría
 * que repiten un historial funcional no se muestran (prevalece el funcional).
 */
@Injectable()
export class ProjectHistoryService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    private readonly access: ProjectAccessService,
  ) {}

  async list(
    actor: ProjectActor,
    projectId: string,
    request: { page: number; pageSize: number; kinds: readonly ProjectHistoryKind[] },
  ): Promise<Page<ProjectHistoryEntry>> {
    await this.access.findVisible(actor, projectId);
    const page = await this.projects.listHistory(projectId, {
      page: request.page,
      pageSize: request.pageSize,
      kinds: request.kinds,
      excludedAuditEvents: HISTORY_DUPLICATED_AUDIT_EVENTS,
      classificationEvent: PROJECT_AUDIT_EVENTS.classified,
    });
    return {
      ...page,
      items: page.items.map((record) => {
        const { event, changes } = historyChanges(record);
        return {
          id: record.id,
          occurredAt: record.occurredAt,
          actor: record.actor,
          kind: record.kind,
          event,
          subject: record.subject,
          changes,
          comment: record.comment,
        };
      }),
    };
  }
}
