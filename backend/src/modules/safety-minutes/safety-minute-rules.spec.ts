import { ResourceConflictError, BusinessRuleViolationError } from '@/common/errors/application-error';

import {
  businessToday,
  deleteLockReason,
  editLockReason,
  isDeletable,
  isEditable,
  isPastDate,
  safetyMinuteDuplicateError,
  safetyMinuteLockedError,
  safetyMinutePastDateError,
} from './safety-minute-rules';

const TODAY = '2026-10-14';

describe('reglas del minuto de seguridad (RN-AJ1.9–RN-AJ1.12)', () => {
  describe('"hoy" en la zona del negocio (RN-AJ1.9)', () => {
    it('America/Guatemala (UTC-6) todavía es el día anterior a las 03:00 UTC', () => {
      expect(businessToday(new Date('2026-10-15T03:00:00Z'), 'America/Guatemala')).toBe('2026-10-14');
    });

    it('a las 06:00 UTC ya es el día siguiente en Guatemala; en UTC es el mismo día', () => {
      const now = new Date('2026-10-15T06:00:00Z');
      expect(businessToday(now, 'America/Guatemala')).toBe('2026-10-15');
      expect(businessToday(now, 'UTC')).toBe('2026-10-15');
    });

    it('una zona al este adelanta la fecha', () => {
      expect(businessToday(new Date('2026-10-14T20:00:00Z'), 'Asia/Tokyo')).toBe('2026-10-15');
    });
  });

  describe.each([
    ['pasada', '2026-10-13', { editable: false, deletable: false, past: true, edit: 'past', del: 'past' }],
    ['de hoy', TODAY, { editable: true, deletable: false, past: false, edit: null, del: 'today' }],
    ['futura', '2026-10-15', { editable: true, deletable: true, past: false, edit: null, del: null }],
  ])('fecha %s', (_name, date, expected) => {
    it('editable, borrable, motivos de bloqueo y fecha pasada', () => {
      expect(isEditable(date, TODAY)).toBe(expected.editable);
      expect(isDeletable(date, TODAY)).toBe(expected.deletable);
      expect(isPastDate(date, TODAY)).toBe(expected.past);
      expect(editLockReason(date, TODAY)).toBe(expected.edit);
      expect(deleteLockReason(date, TODAY)).toBe(expected.del);
    });
  });

  it('compara fechas de distinto mes y año como calendario', () => {
    expect(isPastDate('2026-09-30', '2026-10-01')).toBe(true);
    expect(isDeletable('2027-01-01', '2026-12-31')).toBe(true);
  });

  describe('errores', () => {
    it('SAFETY_MINUTE_LOCKED es 409 con details[0].reason', () => {
      const error = safetyMinuteLockedError('today', TODAY);
      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error.code).toBe('SAFETY_MINUTE_LOCKED');
      expect(error.details[0]).toMatchObject({ field: 'displayDate', reason: 'today' });
      expect(safetyMinuteLockedError('past', '2026-10-01').details[0]).toMatchObject({ reason: 'past' });
    });

    it('SAFETY_MINUTE_DUPLICATE es 409 con details[0].field = displayDate', () => {
      const error = safetyMinuteDuplicateError(TODAY);
      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error.code).toBe('SAFETY_MINUTE_DUPLICATE');
      expect(error.details[0]).toMatchObject({ field: 'displayDate' });
    });

    it('SAFETY_MINUTE_PAST_DATE es 422', () => {
      const error = safetyMinutePastDateError('2026-10-01');
      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect(error.code).toBe('SAFETY_MINUTE_PAST_DATE');
    });
  });
});
