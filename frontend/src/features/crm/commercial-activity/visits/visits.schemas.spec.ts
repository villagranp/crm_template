import { describe, expect, it } from 'vitest';

import { toDateTimeLocalValue } from '../common/date-time';
import { DONE_VISIT, PENDING_VISIT, VISIT_FORM_OPTIONS } from '../testing/visit-fixtures';
import { CUSTOMER_REF, ME, OTHER_USER } from '../testing/fixtures';

import {
  buildVisitCancelSchema,
  buildVisitCompletionSchema,
  buildVisitConfirmationSchema,
  buildVisitPlanningSchema,
  buildVisitRescheduleSchema,
  confirmationSummaryRequired,
  emptyVisitPlanningValues,
  formatReminder,
  isPastStart,
  reminderMinutesFrom,
  reminderValuesFrom,
  toCreateVisitInput,
  toUpdateVisitInput,
  toVisitCancellationInput,
  toVisitCompletionInput,
  toVisitConfirmationInput,
  toVisitReschedulingInput,
  visitCompletionValuesFrom,
  visitPlanningValuesFrom,
  type VisitPlanningValues,
} from './visits.schemas';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const CUSTOMER = { ...CUSTOMER_REF, countryId: 'co-1' };

function local(iso: string): string {
  return toDateTimeLocalValue(iso);
}

function planning(overrides: Partial<VisitPlanningValues> = {}): VisitPlanningValues {
  return {
    ...emptyVisitPlanningValues({ customer: CUSTOMER, project: null, opportunity: null }),
    scheduledStartAt: local('2026-10-20T15:00:00.000Z'),
    objective: 'Presentar catálogo',
    ...overrides,
  };
}

function issues(result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]));
}

describe('recordatorio (RN-04.13, DM-27)', () => {
  it('convierte número + unidad a minutos, sin lista fija', () => {
    expect(reminderMinutesFrom('', 'minutes')).toBeNull();
    expect(reminderMinutesFrom('45', 'minutes')).toBe(45);
    expect(reminderMinutesFrom('2', 'hours')).toBe(120);
    expect(reminderMinutesFrom('1.5', 'hours')).toBeNaN();
    expect(reminderMinutesFrom('-1', 'minutes')).toBeNaN();
  });

  it('muestra horas exactas como horas y lo demás en minutos', () => {
    expect(reminderValuesFrom(120)).toEqual({ reminderAmount: '2', reminderUnit: 'hours' });
    expect(reminderValuesFrom(90)).toEqual({ reminderAmount: '90', reminderUnit: 'minutes' });
    expect(reminderValuesFrom(0)).toEqual({ reminderAmount: '0', reminderUnit: 'minutes' });
    expect(reminderValuesFrom(null)).toEqual({ reminderAmount: '', reminderUnit: 'minutes' });
    expect(formatReminder(90)).toBe('1 h 30 min antes');
    expect(formatReminder(120)).toBe('2 h antes');
    expect(formatReminder(15)).toBe('15 min antes');
    expect(formatReminder(0)).toBe('A la hora de inicio');
    expect(formatReminder(null)).toBe('Sin recordatorio');
  });
});

describe('planificación (E.7, RN-04.13, RN-04.15)', () => {
  const create = buildVisitPlanningSchema({ mode: 'create', requiredFields: VISIT_FORM_OPTIONS.requiredFields });

  it('exige cliente, fecha de inicio y objetivo (AC-04.25)', () => {
    const result = create.safeParse({ ...emptyVisitPlanningValues(), objective: '  ' });
    expect(issues(result)).toEqual({
      link: 'Este campo es obligatorio.',
      scheduledStartAt: 'Este campo es obligatorio.',
      objective: 'Este campo es obligatorio.',
    });
  });

  it('añade los obligatorios del parámetro (p. ej. ubicación) y valida fin y recordatorio', () => {
    const schema = buildVisitPlanningSchema({ mode: 'create', requiredFields: [...VISIT_FORM_OPTIONS.requiredFields, 'location'] });
    const result = schema.safeParse(
      planning({ scheduledEndAt: local('2026-10-20T14:00:00.000Z'), reminderAmount: '800', reminderUnit: 'hours' }),
    );
    expect(issues(result)).toEqual({
      location: 'Este campo es obligatorio.',
      scheduledEndAt: 'No puede ser anterior al inicio.',
      reminderAmount: 'Escribe un número entero (como máximo 720 h).',
    });
  });

  it('en la edición no exige cliente ni fecha de inicio', () => {
    const edit = buildVisitPlanningSchema({ mode: 'edit', requiredFields: VISIT_FORM_OPTIONS.requiredFields });
    expect(edit.safeParse(planning({ link: { customer: null, project: null, opportunity: null }, scheduledStartAt: '' })).success).toBe(true);
  });

  it('una fecha pasada se permite con aviso (D-04.5)', () => {
    expect(create.safeParse(planning({ scheduledStartAt: local('2026-10-01T15:00:00.000Z') })).success).toBe(true);
    expect(isPastStart(local('2026-10-01T15:00:00.000Z'), NOW)).toBe(true);
    expect(isPastStart(local('2026-10-20T15:00:00.000Z'), NOW)).toBe(false);
    expect(isPastStart('', NOW)).toBe(false);
  });

  it('el alta omite los vacíos y el responsable si no se puede elegir', () => {
    expect(toCreateVisitInput(planning({ owner: OTHER_USER }), false)).toEqual({
      customerId: CUSTOMER.id,
      scheduledStartAt: '2026-10-20T15:00:00.000Z',
      objective: 'Presentar catálogo',
    });
    expect(
      toCreateVisitInput(
        planning({
          owner: OTHER_USER,
          location: ' Planta ',
          reminderAmount: '2',
          reminderUnit: 'hours',
          participants: [{ kind: 'EXTERNAL', externalName: 'Pedro', displayName: 'Pedro' }],
        }),
        true,
      ),
    ).toEqual({
      customerId: CUSTOMER.id,
      ownerId: OTHER_USER.id,
      scheduledStartAt: '2026-10-20T15:00:00.000Z',
      objective: 'Presentar catálogo',
      location: 'Planta',
      reminderMinutesBefore: 120,
      participants: [{ externalName: 'Pedro' }],
    });
  });

  it('la edición nunca envía la fecha de inicio ni el cliente; el responsable sólo si cambia', () => {
    const values = visitPlanningValuesFrom(PENDING_VISIT);
    expect(values.reminderAmount).toBe('2');
    expect(values.reminderUnit).toBe('hours');
    expect(values.participants).toHaveLength(2);
    expect(toUpdateVisitInput({ ...values, location: '' }, PENDING_VISIT)).toEqual({
      projectId: PENDING_VISIT.project?.id,
      scheduledEndAt: null,
      objective: 'Presentar catálogo',
      location: null,
      reminderMinutesBefore: 120,
      participants: [{ externalName: 'Pedro Externo' }, { userId: OTHER_USER.id }],
    });
    expect(toUpdateVisitInput({ ...values, owner: OTHER_USER }, PENDING_VISIT).ownerId).toBe(OTHER_USER.id);
    expect(toUpdateVisitInput({ ...values, owner: ME }, PENDING_VISIT)).not.toHaveProperty('ownerId');
  });
});

describe('realización (RN-04.16, RN-04.17, D-04.4)', () => {
  const schema = buildVisitCompletionSchema(['actualStartAt'], () => NOW);

  it('sólo exige la fecha real, que no puede ser futura, ni el fin real', () => {
    const base = visitCompletionValuesFrom(PENDING_VISIT, NOW);
    expect(issues(schema.safeParse({ ...base, actualStartAt: '' }))).toEqual({ actualStartAt: 'Este campo es obligatorio.' });
    expect(issues(schema.safeParse({ ...base, actualStartAt: local('2026-10-13T12:00:00.000Z') }))).toEqual({ actualStartAt: 'No puede ser futura.' });
    expect(
      issues(schema.safeParse({ ...base, actualStartAt: local('2026-10-11T12:00:00.000Z'), actualEndAt: local('2026-10-11T11:00:00.000Z') })),
    ).toEqual({ actualEndAt: 'No puede ser anterior al inicio.' });
  });

  it('el parámetro visitCompletion añade obligatorios (participants = asistentes)', () => {
    const strict = buildVisitCompletionSchema(['actualStartAt', 'participants', 'resultId'], () => NOW);
    const values = { ...visitCompletionValuesFrom(PENDING_VISIT, NOW), actualStartAt: local('2026-10-11T12:00:00.000Z'), attendees: [] };
    expect(issues(strict.safeParse(values))).toEqual({ attendees: 'Este campo es obligatorio.', resultId: 'Este campo es obligatorio.' });
  });

  it('registrar parte de los invitados y de ahora si la hora planificada no pasó; corregir parte de lo guardado', () => {
    const record = visitCompletionValuesFrom(PENDING_VISIT, NOW);
    expect(record.actualStartAt).toBe(local(NOW.toISOString()));
    expect(record.attendees.map((attendee) => attendee.displayName)).toEqual(['Pedro Externo', OTHER_USER.displayName]);
    const pastPlanned = visitCompletionValuesFrom({ ...PENDING_VISIT, scheduledStartAt: '2026-10-11T15:00:00.000Z' }, NOW);
    expect(pastPlanned.actualStartAt).toBe(local('2026-10-11T15:00:00.000Z'));

    const correct = visitCompletionValuesFrom(DONE_VISIT, NOW);
    expect(correct.actualStartAt).toBe(local('2026-10-05T15:10:00.000Z'));
    expect(correct.attendees.map((attendee) => attendee.displayName)).toEqual(['Pedro Externo']);
    expect(correct.resultId).toBe(DONE_VISIT.completion?.result?.id);
  });

  it('el cuerpo envía todos los campos (el PUT sustituye la realización)', () => {
    expect(toVisitCompletionInput({ ...visitCompletionValuesFrom(DONE_VISIT, NOW), topics: '  ' })).toEqual({
      actualStartAt: '2026-10-05T15:10:00.000Z',
      actualEndAt: null,
      attendees: [{ externalName: 'Pedro Externo' }],
      topics: null,
      agreements: null,
      resultId: DONE_VISIT.completion?.result?.id,
      resultSummary: null,
      comments: null,
      nextAction: 'Enviar cotización',
      nextActionDate: '2026-10-20',
    });
  });
});

describe('confirmación (RN-04.18)', () => {
  it('el resumen es obligatorio sólo si la realización no tiene resumen ni comentarios', () => {
    expect(confirmationSummaryRequired(DONE_VISIT)).toBe(true);
    expect(confirmationSummaryRequired({ completion: { ...DONE_VISIT.completion!, comments: 'Bien' } })).toBe(false);
    expect(buildVisitConfirmationSchema(true).safeParse({ confirmationSummary: ' ' }).success).toBe(false);
    expect(buildVisitConfirmationSchema(false).safeParse({ confirmationSummary: '' }).success).toBe(true);
    expect(toVisitConfirmationInput({ confirmationSummary: ' Ok ' })).toEqual({ confirmationSummary: 'Ok' });
    expect(toVisitConfirmationInput({ confirmationSummary: '' })).toEqual({});
  });
});

describe('reprogramar y cancelar (RN-04.19, RN-04.20)', () => {
  const reschedule = buildVisitRescheduleSchema(PENDING_VISIT.scheduledStartAt, () => NOW);
  const empty = { newScheduledStartAt: '', newScheduledEndAt: '', reasonId: '', reasonText: '', comment: '' };

  it('exige fecha nueva distinta y no pasada, fin coherente y motivo (AC-04.38)', () => {
    expect(issues(reschedule.safeParse(empty))).toEqual({
      newScheduledStartAt: 'Este campo es obligatorio.',
      reasonId: 'Indica un motivo de la lista o escríbelo.',
    });
    expect(issues(reschedule.safeParse({ ...empty, newScheduledStartAt: local(PENDING_VISIT.scheduledStartAt), reasonText: 'x' }))).toEqual({
      newScheduledStartAt: 'Debe ser distinta de la vigente.',
    });
    expect(issues(reschedule.safeParse({ ...empty, newScheduledStartAt: local('2026-10-01T15:00:00.000Z'), reasonId: 'mr-1' }))).toEqual({
      newScheduledStartAt: 'No puede estar en el pasado.',
    });
    expect(
      issues(
        reschedule.safeParse({
          ...empty,
          newScheduledStartAt: local('2026-10-22T15:00:00.000Z'),
          newScheduledEndAt: local('2026-10-22T14:00:00.000Z'),
          reasonId: 'mr-1',
        }),
      ),
    ).toEqual({ newScheduledEndAt: 'No puede ser anterior al inicio.' });
  });

  it('el cuerpo de reprogramar y de cancelar omite lo vacío', () => {
    expect(
      toVisitReschedulingInput({ ...empty, newScheduledStartAt: local('2026-10-22T15:00:00.000Z'), reasonId: 'mr-1', comment: ' Llamó ' }),
    ).toEqual({ newScheduledStartAt: '2026-10-22T15:00:00.000Z', reasonId: 'mr-1', comment: 'Llamó' });
    expect(buildVisitCancelSchema().safeParse({ reasonId: '', reasonText: '', comment: 'x' }).success).toBe(false);
    expect(toVisitCancellationInput({ reasonId: '', reasonText: ' Lluvia ', comment: '' })).toEqual({ reasonText: 'Lluvia' });
  });
});
