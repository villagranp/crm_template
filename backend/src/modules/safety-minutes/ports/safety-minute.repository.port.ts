import type { CalendarDate } from '@/common/calendar-date';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

export const SAFETY_MINUTE_REPOSITORY = Symbol('SAFETY_MINUTE_REPOSITORY');

/** Campos ordenables de la lista (lista blanca, 6.2). */
export const SAFETY_MINUTE_SORT_FIELDS = ['displayDate', 'createdAt', 'updatedAt'] as const;
export type SafetyMinuteSortField = (typeof SAFETY_MINUTE_SORT_FIELDS)[number];

/** Fila de `safety_minutes` para el mantenimiento. */
export interface SafetyMinuteRecord {
  readonly id: string;
  readonly message: string;
  readonly displayDate: CalendarDate;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Último usuario que la registró o editó; `null` si ya no se resuelve. */
  readonly updatedBy: { readonly id: string; readonly displayName: string } | null;
}

export interface SafetyMinuteSearch extends PageRequest {
  /** Fecha de visualización desde (incluida). */
  readonly from: CalendarDate | null;
  /** Fecha de visualización hasta (incluida). */
  readonly to: CalendarDate | null;
  readonly sortBy: SafetyMinuteSortField;
  readonly sortOrder: 'asc' | 'desc';
}

export interface CreateSafetyMinuteInput {
  readonly message: string;
  readonly displayDate: CalendarDate;
}

export interface UpdateSafetyMinuteInput {
  readonly message?: string;
  readonly displayDate?: CalendarDate;
}

/** Alta: la fila, o el aviso de que ya hay un mensaje para esa fecha (índice único). */
export type CreateSafetyMinuteResult =
  | { readonly ok: true; readonly record: SafetyMinuteRecord }
  | { readonly ok: false; readonly reason: 'DUPLICATE' };

/** Edición: la fila, `DUPLICATE` si la fecha nueva está ocupada o `NOT_FOUND` si la fila ya no existe. */
export type UpdateSafetyMinuteResult =
  | { readonly ok: true; readonly record: SafetyMinuteRecord }
  | { readonly ok: false; readonly reason: 'DUPLICATE' | 'NOT_FOUND' };

/**
 * Puerto de datos del minuto de seguridad (Ajustes 1, AJ1-2). Sin tipos del ORM (ADR-004):
 * el adaptador traduce la violación del índice único (`P2002`) a `DUPLICATE`, la última
 * barrera contra dos altas concurrentes a la misma fecha (RN-AJ1.8).
 */
export interface SafetyMinuteRepository {
  search(search: SafetyMinuteSearch): Promise<Page<SafetyMinuteRecord>>;
  findById(id: string): Promise<SafetyMinuteRecord | null>;
  findByDisplayDate(displayDate: CalendarDate): Promise<SafetyMinuteRecord | null>;
  /** Solo fecha y mensaje de la fila de esa fecha, sin resolver autores (`/me/safety-minute`). */
  findMessageByDisplayDate(displayDate: CalendarDate): Promise<{ readonly displayDate: CalendarDate; readonly message: string } | null>;
  create(input: CreateSafetyMinuteInput, actorId: string | null): Promise<CreateSafetyMinuteResult>;
  /**
   * La escritura se condiciona en la propia sentencia a `displayDate >= notBefore` (hoy): si la
   * fila pasó a pasado entre la lectura y la escritura no se toca y responde `NOT_FOUND`; el
   * servicio relee para distinguir "bloqueada" de "ya no existe".
   */
  update(id: string, input: UpdateSafetyMinuteInput, actorId: string | null, notBefore: CalendarDate): Promise<UpdateSafetyMinuteResult>;
  /** Borrado físico (RN-AJ1.11) condicionado a `displayDate > after` (hoy); `false` si no borró nada. */
  delete(id: string, after: CalendarDate): Promise<boolean>;
}
