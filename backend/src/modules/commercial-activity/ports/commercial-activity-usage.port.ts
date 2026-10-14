import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

export const COMMERCIAL_ACTIVITY_USAGE_QUERY = Symbol('COMMERCIAL_ACTIVITY_USAGE_QUERY');

/** Visitas y actividades en curso de un cliente o proyecto. */
export interface OpenCommercialActivityCount {
  /** Visitas pendientes (`isPending`) o realizadas sin confirmar (`isDone`). */
  readonly visits: number;
  /** Actividades abiertas (`isOpen`) no eliminadas. */
  readonly activities: number;
  readonly total: number;
}

/**
 * Conteos que necesitan Clientes (02) y Proyectos (03) para decidir el bloqueo de
 * eliminaciones (04 F.6, G.2, DM-33). No aplica visibilidad: es una comprobación
 * interna del módulo consumidor, que ya autorizó sobre su registro. Con `tx`, cuenta
 * dentro de la transacción del consumidor (que habrá bloqueado su fila padre).
 *
 * Sin reglas de negocio de 02/03: qué hacen con el conteo lo deciden ellos.
 */
export interface CommercialActivityUsageQuery {
  countOpenByCustomer(customerId: string, tx?: TransactionContext): Promise<OpenCommercialActivityCount>;
  countOpenByProject(projectId: string, tx?: TransactionContext): Promise<OpenCommercialActivityCount>;
  /** Participaciones del contacto en visitas o en actividades no eliminadas (cualquier rol). */
  countByContact(contactId: string, tx?: TransactionContext): Promise<number>;
}
