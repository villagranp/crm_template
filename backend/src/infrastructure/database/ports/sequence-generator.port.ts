import type { TransactionContext } from './transaction.port';

export const SEQUENCE_GENERATOR = Symbol('SEQUENCE_GENERATOR');

export interface SequenceNextOptions {
  /** Instante de referencia para `{year}`, `{month}` y el reinicio por periodo. Por defecto, ahora. */
  readonly at?: Date;
  /**
   * Zona horaria IANA en la que se calcula el periodo. Por defecto `UTC`.
   * Los casos de uso del CRM pasan `crm.zona_horaria_negocio` (00 §8.2) para
   * que el cambio de año ocurra a medianoche del negocio y no de UTC. Es
   * irrelevante para secuencias con `resetPolicy = NONE` y sin `{year}`/`{month}`
   * (`crm.cliente`).
   */
  readonly timeZone?: string;
}

/**
 * Folios humanos (00 §6.1): `CLI-000123`, `PRY-2026-00042`.
 *
 * Contrato:
 * - Toma la fila de `sequences` con `SELECT … FOR UPDATE`: dos altas concurrentes
 *   se serializan y nunca obtienen el mismo número (nunca `MAX()+1`).
 * - Con `tx`, el incremento forma parte de la transacción del llamador: si el
 *   alta se deshace, el número también. Sin `tx`, usa una transacción propia.
 *   La fila queda bloqueada hasta que la transacción termina: el llamador debe
 *   pedir el folio lo más tarde posible dentro de ella.
 * - Aplica `prefix`, `pattern` (`{prefix}`, `{year}`, `{month}`, `{seq}`),
 *   `padding` y `resetPolicy` (`NONE`, `YEAR`, `MONTH`: al cambiar de periodo el
 *   contador vuelve a 1).
 * - Clave inexistente → `SequenceNotFoundError` (fallo de configuración: la
 *   semilla esencial crea las secuencias; la API responde 500).
 */
export interface SequenceGenerator {
  next(key: string, tx?: TransactionContext, options?: SequenceNextOptions): Promise<string>;
}

/** La secuencia no existe en `sequences`. Es un fallo de configuración, no del usuario. */
export class SequenceNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Sequence ${key} does not exist`);
    this.name = 'SequenceNotFoundError';
  }
}
