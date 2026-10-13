import { hasValue, notApplicableFields, typeSpecificFields } from './activity-type-fields';

/** Valores de `metadata.fields` aprobados en D-04.8. */
const CALL = {
  isInteraction: true,
  fields: ['scheduledAt', 'durationMinutes', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'],
};
const EMAIL = { isInteraction: true, fields: ['scheduledAt', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'] };
const TASK = { isInteraction: false, fields: ['scheduledAt', 'resultId', 'resultNotes'] };

describe('activity-type-fields (RN-04.24, PF-04.5)', () => {
  it('lee los campos admitidos e ignora nombres desconocidos', () => {
    expect(typeSpecificFields(TASK)).toEqual(['scheduledAt', 'resultId', 'resultNotes']);
    expect(typeSpecificFields({ fields: ['summary', 'colorFavorito'] })).toEqual(['summary']);
    expect(typeSpecificFields({ isInteraction: true })).toEqual([]);
    expect(typeSpecificFields(null)).toEqual([]);
  });

  it('una tarea no admite duración, participantes, resumen ni siguiente acción', () => {
    expect(
      notApplicableFields(typeSpecificFields(TASK), {
        durationMinutes: 30,
        participants: [{ externalName: 'X' }],
        summary: 'Resumen',
        nextAction: 'Llamar',
        nextActionDate: '2026-10-20',
        scheduledAt: new Date(),
        resultNotes: 'ok',
      }),
    ).toEqual(['durationMinutes', 'participants', 'summary', 'nextAction', 'nextActionDate']);
  });

  it('un correo admite todo salvo la duración; los valores vacíos no cuentan', () => {
    expect(notApplicableFields(typeSpecificFields(EMAIL), { durationMinutes: 0, summary: 'x' })).toEqual(['durationMinutes']);
    expect(notApplicableFields(typeSpecificFields(TASK), { durationMinutes: null, participants: [], summary: '  ' })).toEqual([]);
    expect(notApplicableFields(typeSpecificFields(CALL), { durationMinutes: 15, participants: [{}] })).toEqual([]);
  });

  it('revalidación al cambiar de tipo: los valores ya guardados que el tipo nuevo no admite fallan', () => {
    const stored = { durationMinutes: 20, summary: 'Llamada hecha', resultNotes: 'ok' };
    expect(notApplicableFields(typeSpecificFields(CALL), stored)).toEqual([]);
    expect(notApplicableFields(typeSpecificFields(TASK), stored)).toEqual(['durationMinutes', 'summary']);
  });

  it('hasValue', () => {
    expect([null, undefined, '', ' ', []].map(hasValue)).toEqual([false, false, false, false, false]);
    expect([0, 'a', [1], false].map(hasValue)).toEqual([true, true, true, true]);
  });
});
