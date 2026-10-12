import { dateRangeIssue, missingRequiredFieldIssues, normalizeProjectCode, projectRequiredFields, trimOptional } from './project-rules';

describe('project-rules (03 C.1)', () => {
  describe('projectRequiredFields (RN-03.3)', () => {
    it('siempre incluye los obligatorios de base y reparte los del parámetro por operación', () => {
      expect(projectRequiredFields({})).toEqual({
        all: ['name', 'customerId', 'countryId', 'ownerId'],
        general: ['name', 'customerId', 'countryId', 'ownerId'],
        classification: [],
      });
      expect(projectRequiredFields({ project: ['city', 'projectTypeId', 'estimatedQuantity', 'phaseId', 'name'] })).toEqual({
        all: ['name', 'customerId', 'countryId', 'ownerId', 'city', 'projectTypeId', 'estimatedQuantity', 'phaseId'],
        general: ['name', 'customerId', 'countryId', 'city', 'ownerId'],
        classification: ['projectTypeId', 'estimatedQuantity'],
      });
    });

    it('ignora las entidades ajenas al proyecto', () => {
      expect(projectRequiredFields({ customer: ['email'] }).all).toEqual(['name', 'customerId', 'countryId', 'ownerId']);
    });
  });

  describe('missingRequiredFieldIssues', () => {
    const required = ['name', 'city', 'estimatedDecisionDate'];

    it('alta: falta lo nulo, vacío u omitido', () => {
      expect(missingRequiredFieldIssues(required, { name: 'Obra', city: '  ' }, 'create')).toEqual([
        { field: 'city', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required' },
        { field: 'estimatedDecisionDate', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required' },
      ]);
    });

    it('edición: solo lo que se envía vacío; lo omitido no cambia', () => {
      expect(missingRequiredFieldIssues(required, { city: null }, 'edit')).toEqual([
        { field: 'city', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required' },
      ]);
      expect(missingRequiredFieldIssues(required, {}, 'edit')).toEqual([]);
    });
  });

  describe('dateRangeIssue (RN-03.4, PF-03.7)', () => {
    it('fin anterior al inicio es inválido; igual o posterior, válido; sin alguna fecha no hay regla', () => {
      expect(dateRangeIssue('2026-12-01', '2026-11-30')).toEqual({
        field: 'estimatedEndDate',
        code: 'INVALID_DATE_RANGE',
        message: 'The end date cannot be earlier than the start date',
        startField: 'estimatedStartDate',
      });
      expect(dateRangeIssue('2026-12-01', '2026-12-01')).toBeNull();
      expect(dateRangeIssue('2026-12-01', '2027-01-01')).toBeNull();
      expect(dateRangeIssue(null, '2020-01-01')).toBeNull();
      expect(dateRangeIssue('2026-12-01', null)).toBeNull();
    });
  });

  it('normalizeProjectCode: recorta y pasa a mayúsculas (DM-17)', () => {
    expect(normalizeProjectCode('  pry-man-1 ')).toBe('PRY-MAN-1');
    expect(normalizeProjectCode('   ')).toBeNull();
    expect(normalizeProjectCode(undefined)).toBeNull();
  });

  it('trimOptional: conserva `undefined` (sin cambio) y convierte vacío en `null`', () => {
    expect(trimOptional(undefined)).toBeUndefined();
    expect(trimOptional(null)).toBeNull();
    expect(trimOptional('  ')).toBeNull();
    expect(trimOptional(' Zona 10 ')).toBe('Zona 10');
  });
});
