import { Inject, Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';

import { type AuditChanges, auditDiff } from './audit-diff';
import { AUDIT_REPOSITORY, type AuditRepository } from './ports/audit.repository.port';

/** Quién hizo el cambio y desde dónde. Se construye con `auditContextFrom(request)`. */
export interface AuditContext {
  correlationId: string;
  actorId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
}

export function auditContextFrom(request: AppRequest): AuditContext {
  return {
    correlationId: request.correlationId,
    actorId: request.principal?.subjectId ?? null,
    actorEmail: request.principal?.email ?? null,
    ipAddress: request.ip ?? null,
  };
}

export interface AuditEventOptions {
  /** Tipo de recurso en singular y minúsculas: `user`, `role`, `menu_option`… */
  resourceType: string;
  resourceId: string;
  /** Estado anterior y posterior; se guarda solo la diferencia. Omitir en eventos sin cambio de datos. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Bitácora de administración (PLAN-ADMIN, D11).
 *
 * Toda mutación de administración llama aquí con un evento `recurso.accion`
 * en pasado (`role.created`, `user.suspended`) y el antes/después. Una
 * actualización que no cambia nada no deja registro.
 *
 * Compromiso aceptado (no atómico): la fila de auditoría se escribe **después**
 * de la mutación y en una sentencia aparte, fuera de su transacción (incluidas
 * las secciones críticas con bloqueo consultivo de D3, D7 y D8). Motivo: los
 * puertos de cada módulo abren su propia transacción y aún no hay un contexto
 * transaccional compartido entre adaptadores; pasar la transacción a esta
 * bitácora exigiría acoplar `AuditRepository` a cada uno de ellos. Mantener la
 * escritura fuera además evita alargar el bloqueo con la inserción.
 *
 * Consecuencia: si la inserción falla, la petición responde 500 **con el
 * cambio ya aplicado** y sin su registro. El fallo queda en el log
 * estructurado (con correlation ID) por el filtro global, así que es
 * detectable, pero no se deshace. Seguimiento previsto en PLAN-ADMIN: pasar la
 * transacción (unidad de trabajo) a `record` para que mutación y auditoría se
 * confirmen juntas.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  async record(event: string, context: AuditContext, options: AuditEventOptions): Promise<void> {
    const tracksChanges = options.before !== undefined || options.after !== undefined;
    const changes: AuditChanges | null = tracksChanges
      ? auditDiff(options.before ?? null, options.after ?? null)
      : null;

    if (changes && Object.keys(changes).length === 0) {
      return;
    }

    await this.repository.record({
      event,
      correlationId: context.correlationId,
      subjectId: context.actorId,
      subjectEmail: context.actorEmail,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      ipAddress: context.ipAddress,
      changes,
      metadata: options.metadata ?? null,
    });
  }
}
