import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';
import { BUSINESS_CLOCK, type BusinessClock } from '@/modules/commercial-metrics/business-clock';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import {
  SAFETY_MINUTE_REPOSITORY,
  type SafetyMinuteRecord,
  type SafetyMinuteRepository,
  type SafetyMinuteSortField,
  type UpdateSafetyMinuteInput,
} from './ports/safety-minute.repository.port';
import {
  BUSINESS_TIME_ZONE_PARAMETER,
  businessToday,
  deleteLockReason,
  editLockReason,
  isDeletable,
  isEditable,
  isPastDate,
  safetyMinuteDuplicateError,
  safetyMinuteLockedError,
  safetyMinutePastDateError,
  type SafetyMinuteLockReason,
} from './safety-minute-rules';

export const SAFETY_MINUTE_RESOURCE_TYPE = 'safety_minute';
export const SAFETY_MINUTE_EVENTS = {
  created: 'safety_minute.created',
  updated: 'safety_minute.updated',
  deleted: 'safety_minute.deleted',
} as const;

/** Un mensaje con lo que el servidor decide sobre él (RN-AJ1.10–RN-AJ1.11), para que la interfaz no duplique la regla. */
export interface SafetyMinuteView {
  readonly record: SafetyMinuteRecord;
  readonly editable: boolean;
  readonly deletable: boolean;
}

export interface SearchSafetyMinutesRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: CalendarDate;
  readonly to?: CalendarDate;
  readonly sortBy?: SafetyMinuteSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface CreateSafetyMinuteRequest {
  readonly message: string;
  readonly displayDate: CalendarDate;
}

export interface UpdateSafetyMinuteRequest {
  readonly message?: string;
  readonly displayDate?: CalendarDate;
}

/** Quién escribe: el usuario local (`created_by_id`/`updated_by_id`) y el contexto de auditoría. */
export interface SafetyMinuteActor {
  readonly userId: string | null;
  readonly audit: AuditContext;
}

export interface TodaySafetyMinute {
  readonly displayDate: CalendarDate;
  readonly message: string;
}

function auditedState(record: SafetyMinuteRecord): Record<string, unknown> {
  return { message: record.message, displayDate: record.displayDate };
}

/**
 * Minuto de seguridad (Ajustes 1, AJ1-2; RN-AJ1.7–RN-AJ1.13, D-AJ1.5).
 *
 * - Un mensaje por fecha de visualización: `409 SAFETY_MINUTE_DUPLICATE` (índice único, también
 *   ante altas concurrentes).
 * - "Hoy" en la zona `crm.zona_horaria_negocio` (RN-AJ1.9). Editables: hoy y futuros; borrables:
 *   solo futuros; los pasados son de solo lectura → `409 SAFETY_MINUTE_LOCKED` (`details[0].reason`).
 * - No se programa para una fecha pasada: `422 SAFETY_MINUTE_PAST_DATE`.
 * - Auditoría `safety_minute.created|updated|deleted` con antes/después (RN-AJ1.13). Nunca se
 *   escribe el mensaje en los logs.
 */
@Injectable()
export class SafetyMinutesService {
  constructor(
    @Inject(SAFETY_MINUTE_REPOSITORY) private readonly repository: SafetyMinuteRepository,
    private readonly audit: AuditService,
    private readonly parameters: ParameterReader,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
  ) {}

  /** "Hoy" del negocio (RN-AJ1.9). */
  async today(): Promise<CalendarDate> {
    const timeZone = await this.parameters.get<string>(BUSINESS_TIME_ZONE_PARAMETER);
    return businessToday(this.clock.now(), timeZone);
  }

  async search(request: SearchSafetyMinutesRequest): Promise<Page<SafetyMinuteView>> {
    const today = await this.today();
    const page = await this.repository.search({
      page: request.page,
      pageSize: request.pageSize,
      from: request.from ?? null,
      to: request.to ?? null,
      sortBy: request.sortBy ?? 'displayDate',
      sortOrder: request.sortOrder ?? 'desc',
    });
    return { ...page, items: page.items.map((record) => this.viewOf(record, today)) };
  }

  async get(id: string): Promise<SafetyMinuteView> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new ResourceNotFoundError('SafetyMinute', id);
    }
    return this.viewOf(record, await this.today());
  }

  /** El mensaje de hoy para cualquier sesión (D-AJ1.9), o `null` si no hay (D-AJ1.3). */
  async findToday(): Promise<TodaySafetyMinute | null> {
    // Lectura sin autor: la respuesta no lo expone, así que no se consulta `users`.
    return this.repository.findMessageByDisplayDate(await this.today());
  }

  async create(request: CreateSafetyMinuteRequest, actor: SafetyMinuteActor): Promise<SafetyMinuteView> {
    const today = await this.today();
    if (isPastDate(request.displayDate, today)) {
      throw safetyMinutePastDateError(request.displayDate);
    }

    const result = await this.repository.create({ message: request.message, displayDate: request.displayDate }, actor.userId);
    if (!result.ok) {
      throw safetyMinuteDuplicateError(request.displayDate);
    }

    await this.audit.record(SAFETY_MINUTE_EVENTS.created, actor.audit, {
      resourceType: SAFETY_MINUTE_RESOURCE_TYPE,
      resourceId: result.record.id,
      before: null,
      after: auditedState(result.record),
    });
    return this.viewOf(result.record, today);
  }

  async update(id: string, request: UpdateSafetyMinuteRequest, actor: SafetyMinuteActor): Promise<SafetyMinuteView> {
    const today = await this.today();
    const current = await this.repository.findById(id);
    if (!current) {
      throw new ResourceNotFoundError('SafetyMinute', id);
    }
    const locked = editLockReason(current.displayDate, today);
    if (locked) {
      throw safetyMinuteLockedError(locked, current.displayDate);
    }
    if (request.displayDate !== undefined && request.displayDate !== current.displayDate && isPastDate(request.displayDate, today)) {
      throw safetyMinutePastDateError(request.displayDate);
    }

    const changes: UpdateSafetyMinuteInput = {
      ...(request.message !== undefined && request.message !== current.message ? { message: request.message } : {}),
      ...(request.displayDate !== undefined && request.displayDate !== current.displayDate ? { displayDate: request.displayDate } : {}),
    };
    if (Object.keys(changes).length === 0) {
      return this.viewOf(current, today);
    }

    const result = await this.repository.update(id, changes, actor.userId, today);
    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw await this.lockedOrNotFound(id, today, editLockReason);
      }
      throw safetyMinuteDuplicateError(changes.displayDate ?? current.displayDate);
    }

    await this.audit.record(SAFETY_MINUTE_EVENTS.updated, actor.audit, {
      resourceType: SAFETY_MINUTE_RESOURCE_TYPE,
      resourceId: id,
      before: auditedState(current),
      after: auditedState(result.record),
    });
    return this.viewOf(result.record, today);
  }

  async delete(id: string, actor: SafetyMinuteActor): Promise<void> {
    const today = await this.today();
    const current = await this.repository.findById(id);
    if (!current) {
      throw new ResourceNotFoundError('SafetyMinute', id);
    }
    const locked = deleteLockReason(current.displayDate, today);
    if (locked) {
      throw safetyMinuteLockedError(locked, current.displayDate);
    }

    if (!(await this.repository.delete(id, today))) {
      throw await this.lockedOrNotFound(id, today, deleteLockReason);
    }
    await this.audit.record(SAFETY_MINUTE_EVENTS.deleted, actor.audit, {
      resourceType: SAFETY_MINUTE_RESOURCE_TYPE,
      resourceId: id,
      before: auditedState(current),
      after: null,
    });
  }

  /**
   * La escritura condicionada por fecha no tocó nada (carrera de medianoche, RN-AJ1.9): se relee
   * para responder `409 SAFETY_MINUTE_LOCKED` si la fila pasó a pasado, o `404` si ya no existe.
   */
  private async lockedOrNotFound(
    id: string,
    today: CalendarDate,
    lockReason: (displayDate: CalendarDate, today: CalendarDate) => SafetyMinuteLockReason | null,
  ): Promise<Error> {
    const latest = await this.repository.findById(id);
    const reason = latest ? lockReason(latest.displayDate, today) : null;
    return latest && reason ? safetyMinuteLockedError(reason, latest.displayDate) : new ResourceNotFoundError('SafetyMinute', id);
  }

  private viewOf(record: SafetyMinuteRecord, today: CalendarDate): SafetyMinuteView {
    return { record, editable: isEditable(record.displayDate, today), deletable: isDeletable(record.displayDate, today) };
  }
}
