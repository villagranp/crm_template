import { describe, expect, it } from 'vitest';

import { ACTIVITY_DETAIL, CUSTOMER_REF, FORM_OPTIONS, OTHER_USER, TYPE_CALL, TYPE_TASK } from '../testing/fixtures';

import {
  activityFormFieldFor,
  activityValuesFrom,
  allowedSpecificFields,
  buildActivityFormSchema,
  emptyActivityValues,
  isActivityFieldRequired,
  toCreateActivityInput,
  toUpdateActivityInput,
  type ActivityFormValues,
} from './activities.schemas';

const CUSTOMER = { ...CUSTOMER_REF, countryId: 'gt' };
const NOW = new Date('2026-10-12T16:00:00.000Z');

function values(overrides: Partial<ActivityFormValues> = {}): ActivityFormValues {
  return {
    ...emptyActivityValues(FORM_OPTIONS, { typeId: TYPE_CALL.id }),
    subject: 'Llamar',
    link: { customer: CUSTOMER, project: null, opportunity: null },
    ...overrides,
  };
}

function issues(formValues: ActivityFormValues, requiredFields = FORM_OPTIONS.requiredFields, mode: 'create' | 'edit' = 'create') {
  const result = buildActivityFormSchema({ mode, types: FORM_OPTIONS.types, requiredFields, canChooseOwner: false, now: () => NOW }).safeParse(formValues);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('activities.schemas (RN-04.23, RN-04.24, RN-04.29)', () => {
  it('los campos específicos salen de metadata.fields del tipo', () => {
    expect(allowedSpecificFields(TYPE_TASK)).toEqual(['scheduledAt', 'resultId', 'resultNotes']);
    expect(allowedSpecificFields(undefined)).toEqual([]);
  });

  it('un obligatorio del parámetro que el tipo no admite no se exige', () => {
    const allowed = allowedSpecificFields(TYPE_TASK);
    expect(isActivityFieldRequired('durationMinutes', ['durationMinutes'], allowed)).toBe(false);
    expect(isActivityFieldRequired('scheduledAt', ['scheduledAt'], allowed)).toBe(true);
    expect(isActivityFieldRequired('dueAt', ['dueAt'], allowed)).toBe(true);
    expect(isActivityFieldRequired('ownerId', ['ownerId'], allowed)).toBe(false);
    expect(isActivityFieldRequired('subject', [], allowed)).toBe(true);
  });

  it('exige tipo, asunto y cliente, y los obligatorios añadidos por el parámetro', () => {
    expect(issues(values({ typeId: '', subject: '  ', link: { customer: null, project: null, opportunity: null } }))).toEqual({
      typeId: 'Este campo es obligatorio.',
      subject: 'Este campo es obligatorio.',
      link: 'Este campo es obligatorio.',
    });
    expect(issues(values(), [...FORM_OPTIONS.requiredFields, 'dueAt', 'durationMinutes'])).toEqual({
      dueAt: 'Este campo es obligatorio.',
      durationMinutes: 'Este campo es obligatorio.',
    });
    expect(issues(values({ typeId: TYPE_TASK.id }), [...FORM_OPTIONS.requiredFields, 'durationMinutes'])).toEqual({});
  });

  it('valida la duración sólo si el tipo la admite', () => {
    expect(issues(values({ durationMinutes: '1500' }))).toEqual({
      durationMinutes: 'Escribe un número entero de minutos entre 0 y 1440.',
    });
    expect(issues(values({ durationMinutes: '2.5' }))).toHaveProperty('durationMinutes');
    expect(issues(values({ typeId: TYPE_TASK.id, durationMinutes: 'x' }))).toEqual({});
  });

  it('"Ya realizada" exige resultado y fecha de finalización no futura', () => {
    expect(issues(values({ alreadyDone: true, completedAt: '2999-01-01T10:00' }))).toEqual({
      completionResultId: 'Indica un resultado de la lista o escribe notas.',
      completedAt: 'La fecha de finalización no puede ser futura.',
    });
    expect(issues(values({ alreadyDone: true, completedAt: '2026-10-12T08:00', completionResultNotes: 'Acordamos visita' }))).toEqual({});
  });

  it('el alta sólo envía lo informado y los campos que el tipo admite', () => {
    const input = toCreateActivityInput(
      values({ typeId: TYPE_TASK.id, durationMinutes: '30', summary: 'no aplica', scheduledAt: '2026-10-20T10:00', resultNotes: '' }),
      TYPE_TASK,
      false,
    );
    expect(input).toEqual({
      typeId: TYPE_TASK.id,
      subject: 'Llamar',
      customerId: CUSTOMER.id,
      priorityId: FORM_OPTIONS.defaults.priorityId,
      statusId: FORM_OPTIONS.defaults.statusId,
      scheduledAt: new Date('2026-10-20T10:00').toISOString(),
    });
  });

  it('el alta "Ya realizada" envía completion, sin estado ni resultado de primer nivel', () => {
    const input = toCreateActivityInput(
      values({
        alreadyDone: true,
        resultNotes: 'ignorado',
        completedAt: '2026-10-12T09:00',
        completionResultId: 'r-ok',
        completionComment: ' Bien ',
        participants: [{ kind: 'EXTERNAL', externalName: 'Pedro', displayName: 'Pedro' }],
      }),
      TYPE_CALL,
      false,
    );
    expect(input.statusId).toBeUndefined();
    expect(input.resultNotes).toBeUndefined();
    expect(input.participants).toEqual([{ externalName: 'Pedro' }]);
    expect(input.completion).toEqual({ completedAt: new Date('2026-10-12T09:00').toISOString(), resultId: 'r-ok', comment: 'Bien' });
  });

  it('el responsable sólo se envía si se puede elegir', () => {
    expect(toCreateActivityInput(values({ owner: OTHER_USER }), TYPE_CALL, false).ownerId).toBeUndefined();
    expect(toCreateActivityInput(values({ owner: OTHER_USER }), TYPE_CALL, true).ownerId).toBe(OTHER_USER.id);
  });

  it('la edición vacía lo que el nuevo tipo no admite y sólo envía cliente, tipo, responsable y estado si cambian', () => {
    const current = activityValuesFrom(ACTIVITY_DETAIL);
    const unchanged = toUpdateActivityInput(current, ACTIVITY_DETAIL, TYPE_CALL);
    expect(unchanged).not.toHaveProperty('typeId');
    expect(unchanged).not.toHaveProperty('customerId');
    expect(unchanged).not.toHaveProperty('ownerId');
    expect(unchanged).not.toHaveProperty('statusId');
    expect(unchanged.durationMinutes).toBe(30);
    expect(unchanged.participants).toEqual([{ externalName: 'Pedro Externo' }]);

    const toTask = toUpdateActivityInput({ ...current, typeId: TYPE_TASK.id, statusId: 's-proc' }, ACTIVITY_DETAIL, TYPE_TASK);
    expect(toTask.typeId).toBe(TYPE_TASK.id);
    expect(toTask.statusId).toBe('s-proc');
    expect(toTask.durationMinutes).toBeNull();
    expect(toTask.participants).toEqual([]);
    expect(toTask.summary).toBeNull();
  });

  it('lleva cada error del backend a su campo', () => {
    expect(activityFormFieldFor('resultId', true)).toBe('completionResultId');
    expect(activityFormFieldFor('resultId', false)).toBe('resultId');
    expect(activityFormFieldFor('projectId', false)).toBe('link');
    expect(activityFormFieldFor('ownerId', false)).toBe('owner');
    expect(activityFormFieldFor('completedAt', true)).toBe('completedAt');
    expect(activityFormFieldFor('desconocido', false)).toBeNull();
  });
});
