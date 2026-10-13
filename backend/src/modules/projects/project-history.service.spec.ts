import type { ProjectAccessService } from './project-access.service';
import { historyChanges, ProjectHistoryService } from './project-history.service';
import type { ProjectHistoryRecord, ProjectsRepository } from './ports/projects.repository.port';
import { makeActor } from './testing/project-fixtures';

function record(kind: ProjectHistoryRecord['kind'], payload: Record<string, unknown>): ProjectHistoryRecord {
  return { id: 'h-1', occurredAt: new Date(), actor: null, kind, subject: null, payload, comment: null };
}

describe('project-history (F-11, AC-03.13)', () => {
  it('historyChanges: forma común `{ field, before, after }` de cada origen', () => {
    expect(historyChanges(record('PHASE', { fromPhase: null, toPhase: 'Diseño', fromProgress: null, toProgress: '0.00' }))).toEqual({
      event: null,
      changes: [
        { field: 'phase', before: null, after: 'Diseño' },
        { field: 'progress', before: null, after: '0.00' },
      ],
    });
    expect(historyChanges(record('STAGE', { fromStage: 'Contactado', toStage: 'Ganado' })).changes).toEqual([
      { field: 'stage', before: 'Contactado', after: 'Ganado' },
    ]);
    expect(historyChanges(record('RESULT', { action: 'RECORDED', outcome: 'PARTIAL', reason: null, awardedPercent: '60.00', decisionDate: '2026-10-05' })).changes).toEqual([
      { field: 'action', before: null, after: 'RECORDED' },
      { field: 'outcome', before: null, after: 'PARTIAL' },
      { field: 'reason', before: null, after: null },
      { field: 'awardedPercent', before: null, after: '60.00' },
      { field: 'decisionDate', before: null, after: '2026-10-05' },
    ]);
    expect(
      historyChanges(record('PROJECT_DATA', { event: 'crm.project.updated', changes: { name: { before: 'A', after: 'B' }, address: { before: null, after: 'Z***' } } })),
    ).toEqual({
      event: 'crm.project.updated',
      changes: [
        { field: 'name', before: 'A', after: 'B' },
        { field: 'address', before: null, after: 'Z***' },
      ],
    });
    expect(historyChanges(record('ATTACHMENT', { event: 'crm.attachment.removed', changes: {} })).changes).toEqual([]);
  });

  it('comprueba la visibilidad y excluye la auditoría que repite un historial funcional', async () => {
    const access = { findVisible: jest.fn().mockResolvedValue({}) };
    const repository = { listHistory: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }) };
    const service = new ProjectHistoryService(repository as unknown as ProjectsRepository, access as unknown as ProjectAccessService);
    await service.list(makeActor(['proyectos.ver']), 'project-1', { page: 1, pageSize: 20, kinds: ['PHASE'] });
    expect(access.findVisible).toHaveBeenCalledWith(expect.anything(), 'project-1');
    expect(repository.listHistory).toHaveBeenCalledWith('project-1', {
      page: 1,
      pageSize: 20,
      kinds: ['PHASE'],
      excludedAuditEvents: [
        'crm.project.phase_changed',
        'crm.opportunity.stage_changed',
        'crm.opportunity_result.recorded',
        'crm.opportunity_result.changed',
        'crm.opportunity_result.cleared',
      ],
      classificationEvent: 'crm.project.classified',
    });
  });
});
