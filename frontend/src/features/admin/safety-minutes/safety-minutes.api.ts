import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/**
 * Cliente del mantenimiento del minuto de seguridad (AJ1 §6.2). Un mensaje por
 * fecha de visualización (`displayDate`, `YYYY-MM-DD`, sin hora). `editable` y
 * `deletable` los calcula el servidor (RN-AJ1.10/11): la interfaz sólo los usa
 * para mostrar u ocultar acciones y no duplica la regla.
 */

/** `SafetyMinuteResponseDto`. */
export interface SafetyMinute {
  id: string;
  /** Texto plano (1–1000), con saltos de línea. Se muestra siempre como texto. */
  message: string;
  /** `YYYY-MM-DD`. */
  displayDate: string;
  editable: boolean;
  deletable: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: string; displayName: string } | null;
}

export interface CreateSafetyMinuteRequest {
  message: string;
  displayDate: string;
}

export interface UpdateSafetyMinuteRequest {
  message?: string;
  displayDate?: string;
}

const PATH = '/safety-minutes';

/**
 * Query: `from`, `to` (sobre `displayDate`), `page`, `pageSize`, `sortBy`
 * (`displayDate` por defecto, `createdAt`, `updatedAt`) y `sortOrder` (`desc` por defecto).
 */
export function listSafetyMinutes(query: ListQuery): Promise<Paginated<SafetyMinute>> {
  return httpClient.get<Paginated<SafetyMinute>>(PATH, { query });
}

export function createSafetyMinute(body: CreateSafetyMinuteRequest): Promise<SafetyMinute> {
  return httpClient.post<SafetyMinute>(PATH, { body });
}

export function updateSafetyMinute(id: string, body: UpdateSafetyMinuteRequest): Promise<SafetyMinute> {
  return httpClient.patch<SafetyMinute>(`${PATH}/${id}`, { body });
}

export function deleteSafetyMinute(id: string): Promise<void> {
  return httpClient.delete<void>(`${PATH}/${id}`);
}
