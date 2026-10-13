import { z } from 'zod';

import type { UserRef } from '../common/commercial-activity.api';
import { EMPTY_COMMERCIAL_LINK, type CommercialLinkValue } from '../common/commercial-link';
import { fromDateTimeLocalValue, isFutureLocalValue, nowDateTimeLocalValue, toDateTimeLocalValue } from '../common/date-time';
import { participantValuesFrom, toParticipantInputs, type ParticipantValue } from '../common/participants';

import type {
  ActivityCompletionInput,
  ActivityDetail,
  ActivityFormOptions,
  ActivitySpecificField,
  ActivityTypeRef,
  CreateActivityInput,
  UpdateActivityInput,
} from './activities.api';
import { ACTIVITY_SPECIFIC_FIELDS } from './activities.api';

/**
 * Formulario de actividad (04 §E.10, F-31 a F-33) y su traducción a los cuerpos
 * de la API. La validación es de experiencia de usuario: el backend valida de
 * nuevo y decide. Los campos específicos que se muestran y se envían los decide
 * el `metadata.fields` del tipo elegido (RN-04.24): nada de listas fijas por tipo.
 */

export const ACTIVITY_LIMITS = {
  subject: 200,
  description: 10_000,
  summary: 2000,
  resultNotes: 2000,
  nextAction: 300,
  completionComment: 2000,
  cancellationComment: 1000,
  durationMinutes: 1440,
} as const;

export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
const RESULT_MESSAGE = 'Indica un resultado de la lista o escribe notas.';
const FUTURE_MESSAGE = 'La fecha de finalización no puede ser futura.';
const DURATION_MESSAGE = `Escribe un número entero de minutos entre 0 y ${ACTIVITY_LIMITS.durationMinutes}.`;
const DATE_MESSAGE = 'Escribe una fecha y hora válidas.';

function maxMessage(limit: number): string {
  return `Usa como máximo ${limit} caracteres.`;
}

export interface ActivityFormValues {
  typeId: string;
  subject: string;
  description: string;
  link: CommercialLinkValue;
  /** Responsable elegido; `null` en el alta = el propio usuario (RN-04.5). */
  owner: UserRef | null;
  priorityId: string;
  statusId: string;
  /** Valores `datetime-local` (zona del navegador). */
  dueAt: string;
  scheduledAt: string;
  durationMinutes: string;
  participants: ParticipantValue[];
  summary: string;
  resultId: string;
  resultNotes: string;
  nextAction: string;
  /** `YYYY-MM-DD` (fecha de calendario, sin zona). */
  nextActionDate: string;
  /** "Ya realizada" (D-04.14): se crea completada en un paso. Sólo en el alta. */
  alreadyDone: boolean;
  completedAt: string;
  completionResultId: string;
  completionResultNotes: string;
  completionComment: string;
}

export type ActivityFormField = keyof ActivityFormValues;

export interface ActivitySchemaContext {
  mode: 'create' | 'edit';
  /** Tipos de `form-options` (más el actual si está desactivado, en la edición). */
  types: readonly ActivityTypeRef[];
  /** `form-options.requiredFields`. */
  requiredFields: readonly string[];
  /** Con `actividades.administrar` se elige el responsable. */
  canChooseOwner: boolean;
  /** Para la validación de "no futura". */
  now?: () => Date;
}

/** Campos específicos que admite un tipo (los desconocidos se ignoran, como el backend). */
export function allowedSpecificFields(type: Pick<ActivityTypeRef, 'fields'> | undefined): ActivitySpecificField[] {
  return type ? ACTIVITY_SPECIFIC_FIELDS.filter((field) => type.fields.includes(field)) : [];
}

/**
 * ¿Se marca como obligatorio? Base del DTO + `requiredFields`; un campo
 * específico que el tipo no admite nunca se exige (Precisiones 04, RN-04.7 vs
 * RN-04.24). El responsable y la prioridad tienen valor por defecto en el alta.
 */
export function isActivityFieldRequired(field: string, requiredFields: readonly string[], allowed: readonly ActivitySpecificField[]): boolean {
  if (field === 'ownerId') {
    return false;
  }
  if ((ACTIVITY_SPECIFIC_FIELDS as readonly string[]).includes(field) && !allowed.includes(field as ActivitySpecificField)) {
    return false;
  }
  return ['typeId', 'subject', 'customerId', 'priorityId'].includes(field) || requiredFields.includes(field);
}

/** Nombre del campo del DTO → campo del formulario. */
const DTO_FIELD: Partial<Record<string, ActivityFormField>> = {
  customerId: 'link',
  projectId: 'link',
  opportunityId: 'link',
  ownerId: 'owner',
};

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function valueOfDtoField(values: ActivityFormValues, field: string): unknown {
  switch (field) {
    case 'customerId':
      return values.link.customer;
    case 'projectId':
      return values.link.project;
    case 'opportunityId':
      return values.link.opportunity;
    case 'ownerId':
      return values.owner;
    case 'participants':
      return values.participants.length > 0 ? values.participants : null;
    default: {
      const value = values[field as ActivityFormField];
      return typeof value === 'string' ? (isBlank(value) ? null : value) : value;
    }
  }
}

/** Esquema del formulario para unas opciones concretas. */
export function buildActivityFormSchema(context: ActivitySchemaContext) {
  const now = context.now ?? (() => new Date());
  return z
    .object({
      typeId: z.string(),
      subject: z.string().max(ACTIVITY_LIMITS.subject, maxMessage(ACTIVITY_LIMITS.subject)),
      description: z.string().max(ACTIVITY_LIMITS.description, maxMessage(ACTIVITY_LIMITS.description)),
      link: z.custom<CommercialLinkValue>(),
      owner: z.custom<UserRef | null>(),
      priorityId: z.string(),
      statusId: z.string(),
      dueAt: z.string(),
      scheduledAt: z.string(),
      durationMinutes: z.string(),
      participants: z.custom<ParticipantValue[]>(),
      summary: z.string().max(ACTIVITY_LIMITS.summary, maxMessage(ACTIVITY_LIMITS.summary)),
      resultId: z.string(),
      resultNotes: z.string().max(ACTIVITY_LIMITS.resultNotes, maxMessage(ACTIVITY_LIMITS.resultNotes)),
      nextAction: z.string().max(ACTIVITY_LIMITS.nextAction, maxMessage(ACTIVITY_LIMITS.nextAction)),
      nextActionDate: z.string(),
      alreadyDone: z.boolean(),
      completedAt: z.string(),
      completionResultId: z.string(),
      completionResultNotes: z.string().max(ACTIVITY_LIMITS.resultNotes, maxMessage(ACTIVITY_LIMITS.resultNotes)),
      completionComment: z.string().max(ACTIVITY_LIMITS.completionComment, maxMessage(ACTIVITY_LIMITS.completionComment)),
    })
    .superRefine((values, ctx) => {
      const type = context.types.find((item) => item.id === values.typeId);
      const allowed = allowedSpecificFields(type);
      const fail = (path: ActivityFormField, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      const completing = context.mode === 'create' && values.alreadyDone;

      const required = new Set([...context.requiredFields, 'typeId', 'subject', 'customerId', 'priorityId']);
      for (const field of required) {
        if (!isActivityFieldRequired(field, context.requiredFields, allowed)) continue;
        if (field === 'ownerId' || (field === 'statusId' && completing)) continue;
        // Con "Ya realizada", el resultado sale del bloque de finalización.
        if (completing && (field === 'resultId' || field === 'resultNotes')) continue;
        if (valueOfDtoField(values, field) === null || valueOfDtoField(values, field) === undefined) {
          fail(DTO_FIELD[field] ?? (field as ActivityFormField), REQUIRED_MESSAGE);
        }
      }

      for (const field of ['dueAt', 'scheduledAt', 'completedAt'] as const) {
        if (!isBlank(values[field]) && fromDateTimeLocalValue(values[field]) === null) {
          fail(field, DATE_MESSAGE);
        }
      }

      if (allowed.includes('durationMinutes') && !isBlank(values.durationMinutes)) {
        const minutes = Number(values.durationMinutes);
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > ACTIVITY_LIMITS.durationMinutes) {
          fail('durationMinutes', DURATION_MESSAGE);
        }
      }

      if (completing) {
        if (isBlank(values.completionResultId) && isBlank(values.completionResultNotes)) {
          fail('completionResultId', RESULT_MESSAGE);
        }
        if (isFutureLocalValue(values.completedAt, now())) {
          fail('completedAt', FUTURE_MESSAGE);
        }
      }
    });
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function specificValues(values: ActivityFormValues, allowed: readonly ActivitySpecificField[], completing: boolean) {
  const all: Required<Pick<CreateActivityInput, ActivitySpecificField>> = {
    scheduledAt: fromDateTimeLocalValue(values.scheduledAt),
    durationMinutes: isBlank(values.durationMinutes) ? null : Number(values.durationMinutes),
    participants: toParticipantInputs(values.participants),
    summary: trimmedOrNull(values.summary),
    resultId: trimmedOrNull(values.resultId),
    resultNotes: trimmedOrNull(values.resultNotes),
    nextAction: trimmedOrNull(values.nextAction),
    nextActionDate: trimmedOrNull(values.nextActionDate),
  };
  return Object.fromEntries(
    ACTIVITY_SPECIFIC_FIELDS.map((field) => {
      // Con "Ya realizada" el resultado va en `completion` (prevalece, Precisiones 04).
      const omitted = !allowed.includes(field) || (completing && (field === 'resultId' || field === 'resultNotes'));
      return [field, omitted ? undefined : all[field]];
    }),
  ) as Partial<Pick<CreateActivityInput, ActivitySpecificField>>;
}

type CompletionValues = Pick<ActivityFormValues, 'completedAt' | 'completionResultId' | 'completionResultNotes' | 'completionComment'>;

function completionInput(values: CompletionValues): ActivityCompletionInput {
  return {
    completedAt: fromDateTimeLocalValue(values.completedAt),
    resultId: trimmedOrNull(values.completionResultId),
    resultNotes: trimmedOrNull(values.completionResultNotes),
    comment: trimmedOrNull(values.completionComment),
  };
}

/** Quita las claves `undefined` y las vacías del alta (omitido = valor por defecto del backend). */
function compact<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)),
  ) as T;
}

/**
 * Cuerpo del alta (F.2). Sólo envía los campos específicos que admite el tipo;
 * sin responsable elegido no envía `ownerId` (el backend asigna al usuario).
 * Con "Ya realizada" añade `completion` y no envía `statusId`.
 */
export function toCreateActivityInput(values: ActivityFormValues, type: ActivityTypeRef | undefined, canChooseOwner: boolean): CreateActivityInput {
  const completing = values.alreadyDone;
  const input: CreateActivityInput = {
    typeId: values.typeId,
    subject: values.subject.trim(),
    customerId: values.link.customer?.id ?? '',
    description: trimmedOrNull(values.description),
    projectId: values.link.project?.id ?? null,
    opportunityId: values.link.opportunity?.id ?? null,
    ownerId: canChooseOwner ? values.owner?.id : undefined,
    priorityId: values.priorityId || undefined,
    statusId: completing ? undefined : values.statusId || undefined,
    dueAt: fromDateTimeLocalValue(values.dueAt),
    ...specificValues(values, allowedSpecificFields(type), completing),
  };
  const body = compact(input);
  return completing ? { ...body, completion: compact(completionInput(values)) } : body;
}

/**
 * Cuerpo del alta sin finalizar, para el camino "Ya realizada" con archivos:
 * se crea abierta, se suben los archivos y después se completa (04 §E.12).
 */
export function toCreateWithoutCompletion(values: ActivityFormValues, type: ActivityTypeRef | undefined, canChooseOwner: boolean): CreateActivityInput {
  return toCreateActivityInput({ ...values, alreadyDone: false }, type, canChooseOwner);
}

export function toCompletionInput(values: CompletionValues): ActivityCompletionInput {
  return compact(completionInput(values));
}

/**
 * Cuerpo de la edición (PATCH, RN-04.27). Envía los generales (`null` = quitar)
 * y los específicos que admite el tipo; los que el tipo ya no admite se envían
 * vacíos para que el backend no los rechace al revalidar (`FIELD_NOT_APPLICABLE`).
 * Cliente, responsable, tipo y estado sólo se envían si cambiaron.
 */
export function toUpdateActivityInput(values: ActivityFormValues, original: ActivityDetail, type: ActivityTypeRef | undefined): UpdateActivityInput {
  const allowed = allowedSpecificFields(type);
  const specific = specificValues(values, ACTIVITY_SPECIFIC_FIELDS, false);
  const cleared: Partial<Record<ActivitySpecificField, unknown>> = {};
  for (const field of ACTIVITY_SPECIFIC_FIELDS) {
    cleared[field] = allowed.includes(field) ? specific[field] : field === 'participants' ? [] : null;
  }

  const input: UpdateActivityInput = {
    subject: values.subject.trim(),
    description: trimmedOrNull(values.description),
    projectId: values.link.project?.id ?? null,
    opportunityId: values.link.opportunity?.id ?? null,
    priorityId: values.priorityId || undefined,
    dueAt: fromDateTimeLocalValue(values.dueAt),
    ...(cleared as Partial<Pick<UpdateActivityInput, ActivitySpecificField>>),
  };
  if (values.typeId !== original.type.id) input.typeId = values.typeId;
  if (values.link.customer && values.link.customer.id !== original.customer.id) input.customerId = values.link.customer.id;
  if (values.owner && values.owner.id !== original.owner.id) input.ownerId = values.owner.id;
  if (values.statusId && values.statusId !== original.status.id) input.statusId = values.statusId;
  return input;
}

/** Valores iniciales del alta (con la preselección ya resuelta). */
export function emptyActivityValues(options: ActivityFormOptions, preset: { typeId?: string | null; link?: CommercialLinkValue } = {}): ActivityFormValues {
  const typeId = preset.typeId && options.types.some((type) => type.id === preset.typeId) ? preset.typeId : '';
  return {
    typeId,
    subject: '',
    description: '',
    link: preset.link ?? EMPTY_COMMERCIAL_LINK,
    owner: null,
    priorityId: options.defaults.priorityId ?? '',
    statusId: options.defaults.statusId ?? '',
    dueAt: '',
    scheduledAt: '',
    durationMinutes: '',
    participants: [],
    summary: '',
    resultId: '',
    resultNotes: '',
    nextAction: '',
    nextActionDate: '',
    alreadyDone: false,
    completedAt: nowDateTimeLocalValue(),
    completionResultId: '',
    completionResultNotes: '',
    completionComment: '',
  };
}

/** Valores de la edición desde el detalle. */
export function activityValuesFrom(activity: ActivityDetail): ActivityFormValues {
  return {
    typeId: activity.type.id,
    subject: activity.subject,
    description: activity.description ?? '',
    link: {
      customer: { id: activity.customer.id, crmCode: activity.customer.crmCode, legalName: activity.customer.legalName, countryId: '' },
      project: activity.project ? { id: activity.project.id, code: activity.project.code, name: activity.project.name } : null,
      opportunity: activity.opportunity ? { id: activity.opportunity.id, code: activity.opportunity.code } : null,
    },
    owner: activity.owner,
    priorityId: activity.priority.id,
    statusId: activity.status.id,
    dueAt: toDateTimeLocalValue(activity.dueAt),
    scheduledAt: toDateTimeLocalValue(activity.scheduledAt),
    durationMinutes: activity.durationMinutes === null ? '' : String(activity.durationMinutes),
    participants: participantValuesFrom(activity.participants),
    summary: activity.summary ?? '',
    resultId: activity.result?.id ?? '',
    resultNotes: activity.resultNotes ?? '',
    nextAction: activity.nextAction ?? '',
    nextActionDate: activity.nextActionDate ?? '',
    alreadyDone: false,
    completedAt: '',
    completionResultId: '',
    completionResultNotes: '',
    completionComment: '',
  };
}

/**
 * Campo del formulario para un error del backend. Con "Ya realizada", el
 * resultado y la fecha de finalización son los del bloque `completion`.
 */
export function activityFormFieldFor(apiField: string, alreadyDone: boolean): ActivityFormField | null {
  if (alreadyDone && apiField === 'resultId') return 'completionResultId';
  if (alreadyDone && apiField === 'resultNotes') return 'completionResultNotes';
  if (apiField === 'comment') return 'completionComment';
  const mapped = DTO_FIELD[apiField];
  if (mapped) return mapped;
  const known: readonly string[] = [
    'typeId',
    'subject',
    'description',
    'priorityId',
    'statusId',
    'dueAt',
    'completedAt',
    ...ACTIVITY_SPECIFIC_FIELDS,
  ];
  return known.includes(apiField) ? (apiField as ActivityFormField) : null;
}
