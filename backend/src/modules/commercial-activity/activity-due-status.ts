/**
 * Clasificación y orden de la bandeja de pendientes (RN-04.31, RN-04.32, DM-7).
 * Definición de referencia única: Inicio (01) y Reportes (05) la reutilizan en
 * lugar de redefinirla (G.2). El adaptador Prisma aplica exactamente lo mismo en SQL.
 *
 * "Vencida" no es un estado del catálogo (00 P4): se deriva de `due_at` y del momento
 * de la consulta.
 */

export const ACTIVITY_DUE_BUCKETS = ['OVERDUE', 'DUE_SOON', 'PENDING'] as const;
export type ActivityDueBucket = (typeof ACTIVITY_DUE_BUCKETS)[number];

/** Filtro de la bandeja (04 F.2): `ALL` o grupos concretos. */
export const PENDING_BUCKET_FILTERS = ['ALL', ...ACTIVITY_DUE_BUCKETS] as const;
export type PendingBucketFilter = (typeof PENDING_BUCKET_FILTERS)[number];

const HOUR_MS = 3_600_000;

/** Límite superior de "próxima a vencer": `now + crm.alertas.actividad_por_vencer_horas`. */
export function dueSoonLimit(now: Date, dueSoonHours: number): Date {
  return new Date(now.getTime() + dueSoonHours * HOUR_MS);
}

/**
 * Grupo de una actividad en la bandeja (RN-04.31); `null` si no está abierta
 * (completadas y canceladas nunca aparecen).
 *
 * - `OVERDUE`: `due_at < now`.
 * - `DUE_SOON`: `now ≤ due_at ≤ now + horas` (límite incluido).
 * - `PENDING`: el resto, incluidas las que no tienen vencimiento.
 */
export function activityDueBucket(
  activity: { readonly isOpen: boolean; readonly dueAt: Date | null },
  now: Date,
  dueSoonHours: number,
): ActivityDueBucket | null {
  if (!activity.isOpen) return null;
  if (activity.dueAt === null) return 'PENDING';
  const due = activity.dueAt.getTime();
  if (due < now.getTime()) return 'OVERDUE';
  if (due <= dueSoonLimit(now, dueSoonHours).getTime()) return 'DUE_SOON';
  return 'PENDING';
}

export interface PendingOrderKey {
  /** `metadata.weight` de `crm.prioridad`: mayor peso, más arriba. */
  readonly priorityWeight: number;
  readonly dueAt: Date | null;
  readonly scheduledAt: Date | null;
  readonly code: string;
}

function ascNullsLast(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.getTime() - b.getTime();
}

/**
 * Orden de la bandeja (RN-04.32): peso de prioridad descendente, vencimiento
 * ascendente (sin vencimiento al final), fecha programada ascendente (nulas al
 * final) y código.
 */
export function comparePendingActivities(a: PendingOrderKey, b: PendingOrderKey): number {
  return (
    b.priorityWeight - a.priorityWeight ||
    ascNullsLast(a.dueAt, b.dueAt) ||
    ascNullsLast(a.scheduledAt, b.scheduledAt) ||
    a.code.localeCompare(b.code)
  );
}
