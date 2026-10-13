import { z } from 'zod';

import type { UserRef } from '../common/commercial-activity.api';
import { EMPTY_COMMERCIAL_LINK, type CommercialLinkValue } from '../common/commercial-link';
import { fromDateTimeLocalValue, isFutureLocalValue, nowDateTimeLocalValue, toDateTimeLocalValue } from '../common/date-time';
import { participantValuesFrom, toParticipantInputs, type ParticipantValue } from '../common/participants';

import type {
  CreateVisitInput,
  UpdateVisitInput,
  VisitCancellationInput,
  VisitCompletionInput,
  VisitConfirmationInput,
  VisitDetail,
  VisitReschedulingInput,
} from './visits.api';

/**
 * Formularios de visitas (04 §E.7, §E.8, F-25 a F-29) y su traducción a los
 * cuerpos de la API. La validación es de experiencia de usuario: el backend
 * valida de nuevo y decide (RN-04.13 a RN-04.20).
 */

export const VISIT_LIMITS = {
  objective: 1000,
  location: 300,
  topics: 10_000,
  agreements: 10_000,
  resultSummary: 2000,
  comments: 2000,
  nextAction: 300,
  confirmationSummary: 2000,
  reasonText: 1000,
  eventComment: 2000,
  /** 30 días (límite técnico, 04 F.1). */
  reminderMinutes: 43_200,
} as const;

export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
const DATE_MESSAGE = 'Escribe una fecha y hora válidas.';
const RANGE_MESSAGE = 'No puede ser anterior al inicio.';
const FUTURE_MESSAGE = 'No puede ser futura.';
const REASON_MESSAGE = 'Indica un motivo de la lista o escríbelo.';

const MINUTES_PER_HOUR = 60;

function maxMessage(limit: number): string {
  return `Usa como máximo ${limit} caracteres.`;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Instante (ms) de un valor `datetime-local`, o `null`. */
function localTime(value: string): number | null {
  const iso = fromDateTimeLocalValue(value);
  return iso === null ? null : new Date(iso).getTime();
}

/** Quita las claves `undefined`, `null` y las listas vacías (omitido = valor por defecto del backend). */
function compact<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)),
  ) as T;
}

// ---------------------------------------------------------------------------
// Recordatorio (RN-04.13, DM-27): número + unidad, sin lista fija de opciones
// ---------------------------------------------------------------------------

export type ReminderUnit = 'minutes' | 'hours';

/** Minutos de un recordatorio; `null` si está vacío; `NaN` si no es válido. */
export function reminderMinutesFrom(amount: string, unit: ReminderUnit): number | null {
  if (isBlank(amount)) {
    return null;
  }
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 0) {
    return Number.NaN;
  }
  return unit === 'hours' ? value * MINUTES_PER_HOUR : value;
}

/** Número + unidad para mostrar un recordatorio guardado (horas si son exactas). */
export function reminderValuesFrom(minutes: number | null): { reminderAmount: string; reminderUnit: ReminderUnit } {
  if (minutes === null) {
    return { reminderAmount: '', reminderUnit: 'minutes' };
  }
  if (minutes > 0 && minutes % MINUTES_PER_HOUR === 0) {
    return { reminderAmount: String(minutes / MINUTES_PER_HOUR), reminderUnit: 'hours' };
  }
  return { reminderAmount: String(minutes), reminderUnit: 'minutes' };
}

/** "30 min antes", "2 h antes", "1 h 30 min antes". */
export function formatReminder(minutes: number | null): string {
  if (minutes === null) {
    return 'Sin recordatorio';
  }
  if (minutes === 0) {
    return 'A la hora de inicio';
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) {
    return `${rest} min antes`;
  }
  return rest === 0 ? `${hours} h antes` : `${hours} h ${rest} min antes`;
}

// ---------------------------------------------------------------------------
// Planificar / editar la planificación (E.7, RN-04.13, RN-04.15)
// ---------------------------------------------------------------------------

export interface VisitPlanningValues {
  /** Cliente y proyecto (las visitas no tienen oportunidad). */
  link: CommercialLinkValue;
  /** Responsable elegido; `null` en el alta = el propio usuario (RN-04.5). */
  owner: UserRef | null;
  /** Valores `datetime-local` (zona del navegador). */
  scheduledStartAt: string;
  scheduledEndAt: string;
  objective: string;
  location: string;
  reminderAmount: string;
  reminderUnit: ReminderUnit;
  /** Invitados (`INVITED`). */
  participants: ParticipantValue[];
}

export type VisitPlanningField = keyof VisitPlanningValues;

export interface VisitPlanningContext {
  mode: 'create' | 'edit';
  /** `form-options.requiredFields` (base + `crm.campos_obligatorios.visit`). */
  requiredFields: readonly string[];
}

/** Campo del DTO → campo del formulario de planificación. */
const PLANNING_FIELD: Readonly<Record<string, VisitPlanningField>> = {
  customerId: 'link',
  projectId: 'link',
  ownerId: 'owner',
  scheduledStartAt: 'scheduledStartAt',
  scheduledEndAt: 'scheduledEndAt',
  objective: 'objective',
  location: 'location',
  reminderMinutesBefore: 'reminderAmount',
  participants: 'participants',
};

export function visitPlanningFieldFor(apiField: string): VisitPlanningField | null {
  return PLANNING_FIELD[apiField] ?? null;
}

/** Obligatorios del formulario: base del DTO + parámetro; el responsable tiene valor por defecto. */
export function isPlanningFieldRequired(field: string, context: VisitPlanningContext): boolean {
  if (field === 'ownerId') {
    return false;
  }
  if (context.mode === 'edit' && (field === 'customerId' || field === 'scheduledStartAt')) {
    return false;
  }
  return ['customerId', 'scheduledStartAt', 'objective'].includes(field) || context.requiredFields.includes(field);
}

function planningValueIsEmpty(values: VisitPlanningValues, field: string): boolean {
  switch (field) {
    case 'customerId':
      return values.link.customer === null;
    case 'projectId':
      return values.link.project === null;
    case 'participants':
      return values.participants.length === 0;
    case 'reminderMinutesBefore':
      return isBlank(values.reminderAmount);
    default: {
      const value = values[field as VisitPlanningField];
      return typeof value === 'string' ? isBlank(value) : value === null || value === undefined;
    }
  }
}

export function buildVisitPlanningSchema(context: VisitPlanningContext) {
  return z
    .object({
      link: z.custom<CommercialLinkValue>(),
      owner: z.custom<UserRef | null>(),
      scheduledStartAt: z.string(),
      scheduledEndAt: z.string(),
      objective: z.string().max(VISIT_LIMITS.objective, maxMessage(VISIT_LIMITS.objective)),
      location: z.string().max(VISIT_LIMITS.location, maxMessage(VISIT_LIMITS.location)),
      reminderAmount: z.string(),
      reminderUnit: z.enum(['minutes', 'hours']),
      participants: z.custom<ParticipantValue[]>(),
    })
    .superRefine((values, ctx) => {
      const fail = (path: VisitPlanningField, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      const required = new Set(['customerId', 'scheduledStartAt', 'objective', ...context.requiredFields]);
      for (const field of required) {
        if (isPlanningFieldRequired(field, context) && planningValueIsEmpty(values, field)) {
          const target = PLANNING_FIELD[field];
          if (target) {
            fail(target, REQUIRED_MESSAGE);
          }
        }
      }

      const start = localTime(values.scheduledStartAt);
      if (context.mode === 'create' && !isBlank(values.scheduledStartAt) && start === null) {
        fail('scheduledStartAt', DATE_MESSAGE);
      }
      const end = localTime(values.scheduledEndAt);
      if (!isBlank(values.scheduledEndAt) && end === null) {
        fail('scheduledEndAt', DATE_MESSAGE);
      } else if (start !== null && end !== null && end < start) {
        fail('scheduledEndAt', RANGE_MESSAGE);
      }

      const reminder = reminderMinutesFrom(values.reminderAmount, values.reminderUnit);
      if (reminder !== null && (Number.isNaN(reminder) || reminder > VISIT_LIMITS.reminderMinutes)) {
        fail('reminderAmount', `Escribe un número entero (como máximo ${VISIT_LIMITS.reminderMinutes / MINUTES_PER_HOUR} h).`);
      }
    });
}

/** Valores iniciales del alta (con la preselección ya resuelta). */
export function emptyVisitPlanningValues(link: CommercialLinkValue = EMPTY_COMMERCIAL_LINK): VisitPlanningValues {
  return {
    link: { ...link, opportunity: null },
    owner: null,
    scheduledStartAt: '',
    scheduledEndAt: '',
    objective: '',
    location: '',
    reminderAmount: '',
    reminderUnit: 'minutes',
    participants: [],
  };
}

/** Valores de la edición de la planificación desde el detalle (sólo invitados). */
export function visitPlanningValuesFrom(visit: VisitDetail): VisitPlanningValues {
  return {
    link: {
      customer: { id: visit.customer.id, crmCode: visit.customer.crmCode, legalName: visit.customer.legalName, countryId: '' },
      project: visit.project ? { id: visit.project.id, code: visit.project.code, name: visit.project.name } : null,
      opportunity: null,
    },
    owner: visit.owner,
    scheduledStartAt: toDateTimeLocalValue(visit.scheduledStartAt),
    scheduledEndAt: toDateTimeLocalValue(visit.scheduledEndAt),
    objective: visit.objective,
    location: visit.location ?? '',
    ...reminderValuesFrom(visit.reminderMinutesBefore),
    participants: participantValuesFrom(visit.participants, 'INVITED'),
  };
}

/**
 * Cuerpo del alta (F.1). Sin responsable elegido no envía `ownerId` (el backend
 * asigna al usuario). Los vacíos se omiten.
 */
export function toCreateVisitInput(values: VisitPlanningValues, canChooseOwner: boolean): CreateVisitInput {
  const input: CreateVisitInput = {
    customerId: values.link.customer?.id ?? '',
    projectId: values.link.project?.id ?? null,
    ownerId: canChooseOwner ? values.owner?.id : undefined,
    scheduledStartAt: fromDateTimeLocalValue(values.scheduledStartAt) ?? '',
    scheduledEndAt: fromDateTimeLocalValue(values.scheduledEndAt),
    objective: values.objective.trim(),
    location: trimmedOrNull(values.location),
    reminderMinutesBefore: reminderMinutesFrom(values.reminderAmount, values.reminderUnit),
    participants: toParticipantInputs(values.participants),
  };
  return compact(input);
}

/**
 * Cuerpo de la edición (`PATCH`, RN-04.15): proyecto, fin, objetivo, ubicación,
 * recordatorio e invitados (`null` = quitar; la lista reemplaza a los invitados).
 * Nunca la fecha de inicio (`422 USE_RESCHEDULE`) ni el cliente. El responsable
 * sólo si cambió (un `ownerId` igual no exige `administrar`).
 */
export function toUpdateVisitInput(values: VisitPlanningValues, original: VisitDetail): UpdateVisitInput {
  const input: UpdateVisitInput = {
    projectId: values.link.project?.id ?? null,
    scheduledEndAt: fromDateTimeLocalValue(values.scheduledEndAt),
    objective: values.objective.trim(),
    location: trimmedOrNull(values.location),
    reminderMinutesBefore: reminderMinutesFrom(values.reminderAmount, values.reminderUnit),
    participants: toParticipantInputs(values.participants),
  };
  if (values.owner && values.owner.id !== original.owner.id) {
    input.ownerId = values.owner.id;
  }
  return input;
}

/** `true` si el inicio ya pasó: se permite planificar en el pasado con aviso (D-04.5). */
export function isPastStart(value: string, now: Date = new Date()): boolean {
  const time = localTime(value);
  return time !== null && time < now.getTime();
}

// ---------------------------------------------------------------------------
// Registrar / corregir la realización (E.8, RN-04.16, RN-04.17, D-04.4)
// ---------------------------------------------------------------------------

export interface VisitCompletionValues {
  actualStartAt: string;
  actualEndAt: string;
  attendees: ParticipantValue[];
  topics: string;
  agreements: string;
  resultId: string;
  resultSummary: string;
  comments: string;
  nextAction: string;
  /** `YYYY-MM-DD`. */
  nextActionDate: string;
}

export type VisitCompletionField = keyof VisitCompletionValues;

const COMPLETION_FIELD: Readonly<Record<string, VisitCompletionField>> = {
  actualStartAt: 'actualStartAt',
  actualEndAt: 'actualEndAt',
  attendees: 'attendees',
  participants: 'attendees',
  topics: 'topics',
  agreements: 'agreements',
  resultId: 'resultId',
  resultSummary: 'resultSummary',
  comments: 'comments',
  nextAction: 'nextAction',
  nextActionDate: 'nextActionDate',
};

export function visitCompletionFieldFor(apiField: string): VisitCompletionField | null {
  return COMPLETION_FIELD[apiField] ?? null;
}

/**
 * Obligatorios de la realización: la fecha real (D-04.4) + lo que añada
 * `crm.campos_obligatorios.visitCompletion` (`participants` = asistentes).
 */
export function isCompletionFieldRequired(field: VisitCompletionField, requiredFields: readonly string[]): boolean {
  if (field === 'actualStartAt') {
    return true;
  }
  return requiredFields.some((required) => COMPLETION_FIELD[required] === field);
}

export function buildVisitCompletionSchema(requiredFields: readonly string[], now: () => Date = () => new Date()) {
  return z
    .object({
      actualStartAt: z.string(),
      actualEndAt: z.string(),
      attendees: z.custom<ParticipantValue[]>(),
      topics: z.string().max(VISIT_LIMITS.topics, maxMessage(VISIT_LIMITS.topics)),
      agreements: z.string().max(VISIT_LIMITS.agreements, maxMessage(VISIT_LIMITS.agreements)),
      resultId: z.string(),
      resultSummary: z.string().max(VISIT_LIMITS.resultSummary, maxMessage(VISIT_LIMITS.resultSummary)),
      comments: z.string().max(VISIT_LIMITS.comments, maxMessage(VISIT_LIMITS.comments)),
      nextAction: z.string().max(VISIT_LIMITS.nextAction, maxMessage(VISIT_LIMITS.nextAction)),
      nextActionDate: z.string(),
    })
    .superRefine((values, ctx) => {
      const fail = (path: VisitCompletionField, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      for (const field of Object.keys(values) as VisitCompletionField[]) {
        if (!isCompletionFieldRequired(field, requiredFields)) continue;
        const value = values[field];
        if (Array.isArray(value) ? value.length === 0 : isBlank(value)) {
          fail(field, REQUIRED_MESSAGE);
        }
      }

      const start = localTime(values.actualStartAt);
      if (!isBlank(values.actualStartAt) && start === null) {
        fail('actualStartAt', DATE_MESSAGE);
      } else if (isFutureLocalValue(values.actualStartAt, now())) {
        fail('actualStartAt', FUTURE_MESSAGE);
      }
      const end = localTime(values.actualEndAt);
      if (!isBlank(values.actualEndAt) && end === null) {
        fail('actualEndAt', DATE_MESSAGE);
      } else if (start !== null && end !== null && end < start) {
        fail('actualEndAt', RANGE_MESSAGE);
      } else if (isFutureLocalValue(values.actualEndAt, now())) {
        fail('actualEndAt', FUTURE_MESSAGE);
      }
    });
}

/**
 * Valores iniciales: al registrar, la fecha real es la planificada si ya pasó
 * (si no, ahora) y los asistentes son los invitados (editables, E.8); al
 * corregir, los datos guardados y los asistentes (`ATTENDED`).
 */
export function visitCompletionValuesFrom(visit: VisitDetail, now: Date = new Date()): VisitCompletionValues {
  const completion = visit.completion;
  if (completion) {
    return {
      actualStartAt: toDateTimeLocalValue(completion.actualStartAt),
      actualEndAt: toDateTimeLocalValue(completion.actualEndAt),
      attendees: participantValuesFrom(visit.participants, 'ATTENDED'),
      topics: completion.topics ?? '',
      agreements: completion.agreements ?? '',
      resultId: completion.result?.id ?? '',
      resultSummary: completion.resultSummary ?? '',
      comments: completion.comments ?? '',
      nextAction: completion.nextAction ?? '',
      nextActionDate: completion.nextActionDate ?? '',
    };
  }
  const planned = new Date(visit.scheduledStartAt);
  const plannedPassed = !Number.isNaN(planned.getTime()) && planned.getTime() <= now.getTime();
  return {
    actualStartAt: plannedPassed ? toDateTimeLocalValue(visit.scheduledStartAt) : nowDateTimeLocalValue(now),
    actualEndAt: '',
    attendees: participantValuesFrom(visit.participants, 'INVITED'),
    topics: '',
    agreements: '',
    resultId: '',
    resultSummary: '',
    comments: '',
    nextAction: '',
    nextActionDate: '',
  };
}

/**
 * Cuerpo de la realización. Con `PUT` (corrección) sustituye a la guardada, así
 * que se envían todos los campos (`null` = vacío) para no borrar sin querer.
 */
export function toVisitCompletionInput(values: VisitCompletionValues): VisitCompletionInput {
  return {
    actualStartAt: fromDateTimeLocalValue(values.actualStartAt) ?? '',
    actualEndAt: fromDateTimeLocalValue(values.actualEndAt),
    attendees: toParticipantInputs(values.attendees),
    topics: trimmedOrNull(values.topics),
    agreements: trimmedOrNull(values.agreements),
    resultId: trimmedOrNull(values.resultId),
    resultSummary: trimmedOrNull(values.resultSummary),
    comments: trimmedOrNull(values.comments),
    nextAction: trimmedOrNull(values.nextAction),
    nextActionDate: trimmedOrNull(values.nextActionDate),
  };
}

// ---------------------------------------------------------------------------
// Confirmar (E.8, RN-04.18)
// ---------------------------------------------------------------------------

/** El resumen es obligatorio si la realización no tiene resumen de resultado ni comentarios. */
export function confirmationSummaryRequired(visit: Pick<VisitDetail, 'completion'>): boolean {
  const completion = visit.completion;
  return !(completion?.resultSummary?.trim() || completion?.comments?.trim());
}

export function buildVisitConfirmationSchema(summaryRequired: boolean) {
  return z.object({
    confirmationSummary: z
      .string()
      .max(VISIT_LIMITS.confirmationSummary, maxMessage(VISIT_LIMITS.confirmationSummary))
      .refine((value) => !summaryRequired || !isBlank(value), 'Escribe un resumen: la realización no tiene resumen ni comentarios.'),
  });
}

export function toVisitConfirmationInput(values: { confirmationSummary: string }): VisitConfirmationInput {
  return compact({ confirmationSummary: trimmedOrNull(values.confirmationSummary) });
}

// ---------------------------------------------------------------------------
// Reprogramar (E.8, RN-04.19) y cancelar (RN-04.20)
// ---------------------------------------------------------------------------

export interface VisitReasonValues {
  reasonId: string;
  reasonText: string;
  comment: string;
}

export interface VisitRescheduleValues extends VisitReasonValues {
  newScheduledStartAt: string;
  newScheduledEndAt: string;
}

function reasonShape() {
  return {
    reasonId: z.string(),
    reasonText: z.string().max(VISIT_LIMITS.reasonText, maxMessage(VISIT_LIMITS.reasonText)),
    comment: z.string().max(VISIT_LIMITS.eventComment, maxMessage(VISIT_LIMITS.eventComment)),
  };
}

function requireReason(values: VisitReasonValues, ctx: z.RefinementCtx): void {
  if (isBlank(values.reasonId) && isBlank(values.reasonText)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: REASON_MESSAGE });
  }
}

/**
 * Reprogramar: nueva fecha obligatoria, distinta de la vigente y no pasada
 * (D-04.5); fin opcional y coherente; motivo de la lista y/o escrito.
 */
export function buildVisitRescheduleSchema(currentStartAt: string, now: () => Date = () => new Date()) {
  const current = new Date(currentStartAt).getTime();
  return z
    .object({ newScheduledStartAt: z.string(), newScheduledEndAt: z.string(), ...reasonShape() })
    .superRefine((values, ctx) => {
      const fail = (path: keyof VisitRescheduleValues, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      const start = localTime(values.newScheduledStartAt);
      if (isBlank(values.newScheduledStartAt)) {
        fail('newScheduledStartAt', REQUIRED_MESSAGE);
      } else if (start === null) {
        fail('newScheduledStartAt', DATE_MESSAGE);
      } else if (start === current) {
        fail('newScheduledStartAt', 'Debe ser distinta de la vigente.');
      } else if (start < now().getTime()) {
        fail('newScheduledStartAt', 'No puede estar en el pasado.');
      }
      const end = localTime(values.newScheduledEndAt);
      if (!isBlank(values.newScheduledEndAt) && end === null) {
        fail('newScheduledEndAt', DATE_MESSAGE);
      } else if (start !== null && end !== null && end < start) {
        fail('newScheduledEndAt', RANGE_MESSAGE);
      }
      requireReason(values, ctx);
    });
}

export function buildVisitCancelSchema() {
  return z.object(reasonShape()).superRefine(requireReason);
}

function reasonInput(values: VisitReasonValues): VisitCancellationInput {
  return compact({ reasonId: trimmedOrNull(values.reasonId), reasonText: trimmedOrNull(values.reasonText), comment: trimmedOrNull(values.comment) });
}

export function toVisitReschedulingInput(values: VisitRescheduleValues): VisitReschedulingInput {
  return {
    newScheduledStartAt: fromDateTimeLocalValue(values.newScheduledStartAt) ?? '',
    ...compact({ newScheduledEndAt: fromDateTimeLocalValue(values.newScheduledEndAt) }),
    ...reasonInput(values),
  };
}

export function toVisitCancellationInput(values: VisitReasonValues): VisitCancellationInput {
  return reasonInput(values);
}
