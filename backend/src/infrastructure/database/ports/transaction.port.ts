/**
 * Transacción de base de datos compartida entre puertos (ADR-004).
 *
 * Algunos casos de uso necesitan que varias operaciones de puertos distintos se
 * confirmen juntas: el alta de un cliente asigna su `crmCode` con
 * `SequenceGenerator` **en la misma transacción** que el `INSERT` (00 §6.1,
 * 02 RN-02.1) y valida sus catálogos dentro de ella (00 §3.5). Para eso los
 * puertos que lo necesitan aceptan un `TransactionContext` opcional.
 *
 * `TransactionContext` es un **handle opaco**: el caso de uso lo recibe de
 * `TransactionRunner.run` y lo pasa tal cual; nunca lo inspecciona. Solo el
 * adaptador que lo creó sabe qué contiene (hoy, el cliente transaccional de
 * Prisma: `prisma/prisma-transaction.ts`). Así el dominio y la aplicación no
 * importan Prisma (CLAUDE.md §8.2).
 *
 * Sin `TransactionContext`, cada puerto abre la suya (comportamiento de siempre).
 */
declare const TRANSACTION_CONTEXT_BRAND: unique symbol;

export interface TransactionContext {
  readonly [TRANSACTION_CONTEXT_BRAND]: true;
}

export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');

export interface TransactionOptions {
  /** Tiempo máximo de la transacción, incluida la espera de bloqueos. Por defecto 10 s. */
  readonly timeoutMs?: number;
}

export interface TransactionRunner {
  /**
   * Abre una transacción, ejecuta `work` con su handle y confirma al terminar.
   * Si `work` lanza, se deshace todo lo hecho con ese handle y el error se propaga.
   * Las transacciones no se anidan: dentro de `work` se usa el handle recibido.
   */
  run<T>(work: (tx: TransactionContext) => Promise<T>, options?: TransactionOptions): Promise<T>;
}
