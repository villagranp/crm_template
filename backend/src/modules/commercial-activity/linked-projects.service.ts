import { Inject, Injectable } from '@nestjs/common';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { PROJECTS_REPOSITORY, type ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';

/**
 * Proyectos vinculados a una visita o actividad dentro de su transacción: bloqueo
 * antes de validar el vínculo (RN-04.2) y `projects.last_activity_at` (RN-04.11,
 * 00 §2.6).
 *
 * Delega en el repositorio de proyectos que publica el Módulo 3
 * (`ProjectsModule` exporta `PROJECTS_REPOSITORY`), para que la fila del proyecto
 * se bloquee y `last_activity_at` se escriba con **un único** protocolo en todo el
 * CRM: `lockProject(id, 'UPDATE', tx)` es el bloqueo que 03 exige a toda escritura
 * de un hijo (serializa con la eliminación del proyecto y con sus otras escrituras)
 * y `touchLastActivity` fija la fecha sin mover `updated_at`.
 */
@Injectable()
export class LinkedProjectsService {
  constructor(@Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository) {}

  /**
   * `FOR UPDATE` sobre cada proyecto no eliminado, en orden de id (dos transacciones
   * que bloquean los mismos proyectos lo hacen en el mismo orden: sin interbloqueos).
   * Un proyecto inexistente o eliminado no se bloquea; la validación posterior del
   * vínculo decide su error.
   */
  async lock(projectIds: readonly string[], tx: TransactionContext): Promise<void> {
    for (const projectId of uniqueIds(projectIds).sort()) {
      await this.projects.lockProject(projectId, 'UPDATE', tx);
    }
  }

  /** `projects.last_activity_at = at` en la transacción del llamador. */
  async touch(projectIds: readonly string[], at: Date, tx: TransactionContext): Promise<void> {
    const ids = uniqueIds(projectIds);
    if (ids.length > 0) {
      await this.projects.touchLastActivity(ids, at, tx);
    }
  }
}

function uniqueIds(projectIds: readonly string[]): string[] {
  return [...new Set(projectIds.map((id) => id.toLowerCase()))];
}
