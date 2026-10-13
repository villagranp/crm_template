import { describe, expect, it } from 'vitest';

import {
  buildClassificationSchema,
  buildPhaseChangeSchema,
  buildProjectFormSchema,
  duplicateFormSchema,
  minimumProgressFor,
  projectProductFormSchema,
  requiredGeneralFields,
  type ClassificationFormValues,
  type DuplicateFormValues,
  type ProjectFormValues,
} from './projects.schemas';
import { PHASES } from './testing/project-fixtures';

function issues(result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]));
}

const VALID: ProjectFormValues = {
  name: 'Torre Norte',
  customer: { id: 'c-1' },
  countryId: 'gt',
  city: '',
  address: '',
  description: '',
  estimatedStartDate: '',
  estimatedEndDate: '',
  estimatedDecisionDate: '',
  owner: null,
  code: '',
};

describe('buildProjectFormSchema (RN-03.3, RN-03.4)', () => {
  const schema = buildProjectFormSchema({ requiredFields: ['name', 'customerId', 'countryId', 'ownerId'], ownerDefaultsToActor: true, canChooseOwner: true });

  it('acepta el mínimo: nombre, cliente y país; el asesor vacío en el alta es el actor', () => {
    expect(schema.safeParse(VALID).success).toBe(true);
  });

  it('exige nombre, cliente y país', () => {
    expect(issues(schema.safeParse({ ...VALID, name: '  ', customer: null, countryId: '' }))).toEqual({
      name: 'Este campo es obligatorio.',
      customer: 'Este campo es obligatorio.',
      countryId: 'Este campo es obligatorio.',
    });
  });

  it('añade los obligatorios de crm.campos_obligatorios.project que son de datos generales, no los de clasificación', () => {
    const withParameter = buildProjectFormSchema({
      requiredFields: ['name', 'customerId', 'countryId', 'ownerId', 'city', 'estimatedDecisionDate', 'projectTypeId'],
      ownerDefaultsToActor: true,
      canChooseOwner: false,
    });
    expect(issues(withParameter.safeParse(VALID))).toEqual({
      city: 'Este campo es obligatorio.',
      estimatedDecisionDate: 'Este campo es obligatorio.',
    });
    expect([...requiredGeneralFields(['projectTypeId', 'city'])].sort()).toEqual(['city', 'countryId', 'customerId', 'name']);
  });

  it('el fin estimado no puede ser anterior al inicio; la decisión no se restringe (DM-16)', () => {
    expect(issues(schema.safeParse({ ...VALID, estimatedStartDate: '2026-11-01', estimatedEndDate: '2026-10-31', estimatedDecisionDate: '2020-01-01' }))).toEqual({
      estimatedEndDate: 'No puede ser anterior al inicio estimado.',
    });
    expect(schema.safeParse({ ...VALID, estimatedStartDate: '2026-11-01', estimatedEndDate: '2026-11-01' }).success).toBe(true);
  });

  it('rechaza fechas que no existen y textos demasiado largos', () => {
    expect(issues(schema.safeParse({ ...VALID, estimatedStartDate: '2026-02-30', name: 'x'.repeat(201), code: 'C'.repeat(31) }))).toEqual({
      estimatedStartDate: 'Escribe una fecha válida.',
      name: 'Usa como máximo 200 caracteres.',
      code: 'Usa como máximo 30 caracteres.',
    });
  });

  it('en la edición con administrar, el asesor es obligatorio', () => {
    const edit = buildProjectFormSchema({ requiredFields: ['ownerId'], ownerDefaultsToActor: false, canChooseOwner: true });
    expect(issues(edit.safeParse(VALID))).toEqual({ owner: 'Este campo es obligatorio.' });
  });
});

describe('duplicateFormSchema (RN-03.20)', () => {
  const values: DuplicateFormValues = {
    name: '',
    customer: { id: 'c-1' },
    estimatedStartDate: '2026-11-01',
    estimatedEndDate: '2026-10-01',
    estimatedDecisionDate: '',
    owner: null,
    code: '',
    copyLocation: true,
    copyDescription: true,
    copyClassification: true,
    copyProducts: false,
  };

  it('el nombre nuevo es obligatorio y las fechas siguen RN-03.4', () => {
    expect(issues(duplicateFormSchema.safeParse(values))).toEqual({
      name: 'Este campo es obligatorio.',
      estimatedEndDate: 'No puede ser anterior al inicio estimado.',
    });
    expect(duplicateFormSchema.safeParse({ ...values, name: 'Copia', estimatedEndDate: '2027-01-01' }).success).toBe(true);
  });
});

describe('buildClassificationSchema (RN-03.26)', () => {
  const base: ClassificationFormValues = {
    projectTypeId: '',
    sectorId: '',
    measureUnitId: '',
    estimatedQuantity: '',
    tonnageMode: 'NONE',
    manualTonnage: '',
  };
  const schema = buildClassificationSchema([]);

  it('sin estimación no exige nada', () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('por regla exige unidad y cantidad', () => {
    expect(issues(schema.safeParse({ ...base, tonnageMode: 'RULE' }))).toEqual({
      measureUnitId: 'Con estimación por regla, elige la unidad.',
      estimatedQuantity: 'Este campo es obligatorio.',
    });
    expect(schema.safeParse({ ...base, tonnageMode: 'RULE', measureUnitId: 'u-m2', estimatedQuantity: '1200' }).success).toBe(true);
  });

  it('manual exige el tonelaje con hasta 4 decimales y sin negativos', () => {
    expect(issues(schema.safeParse({ ...base, tonnageMode: 'MANUAL', manualTonnage: '' }))).toEqual({ manualTonnage: 'Este campo es obligatorio.' });
    expect(issues(schema.safeParse({ ...base, tonnageMode: 'MANUAL', manualTonnage: '-1' }))).toEqual({ manualTonnage: 'Debe ser mayor o igual que 0.' });
    expect(issues(schema.safeParse({ ...base, tonnageMode: 'MANUAL', manualTonnage: '1.23456' }))).toEqual({
      manualTonnage: 'Admite como máximo 4 decimales.',
    });
    expect(schema.safeParse({ ...base, tonnageMode: 'MANUAL', manualTonnage: '50' }).success).toBe(true);
  });

  it('exige los campos de clasificación del parámetro de obligatorios', () => {
    expect(issues(buildClassificationSchema(['projectTypeId', 'sectorId']).safeParse(base))).toEqual({
      projectTypeId: 'Este campo es obligatorio.',
      sectorId: 'Este campo es obligatorio.',
    });
  });

  it('una coma decimal no se confunde con miles (es-GT)', () => {
    expect(issues(schema.safeParse({ ...base, estimatedQuantity: '1,5' }))).toEqual({
      estimatedQuantity: 'Escribe un número válido (punto como separador decimal).',
    });
  });
});

describe('buildPhaseChangeSchema (RN-03.33–RN-03.35)', () => {
  const schema = buildPhaseChangeSchema({
    phases: PHASES,
    progressRules: { FINALIZADO: { progresoMinimo: 100 } },
    currentPhaseId: 'ph-diseno',
    currentProgress: '10.00',
  });

  it('porcentaje entre 0 y 100 con 2 decimales', () => {
    expect(issues(schema.safeParse({ phaseId: 'ph-cotizacion', progress: '50.125', comment: '' }))).toEqual({ progress: 'Admite como máximo 2 decimales.' });
    expect(issues(schema.safeParse({ phaseId: 'ph-cotizacion', progress: '100.01', comment: '' }))).toEqual({ progress: 'Debe ser como máximo 100.' });
    expect(issues(schema.safeParse({ phaseId: 'ph-cotizacion', progress: '-1', comment: '' }))).toEqual({ progress: 'Debe ser mayor o igual que 0.' });
  });

  it('aplica la regla de avance de la fase (FINALIZADO ≥ 100)', () => {
    expect(issues(schema.safeParse({ phaseId: 'ph-finalizado', progress: '90', comment: '' }))).toEqual({ progress: 'Esta fase exige al menos 100%.' });
    expect(schema.safeParse({ phaseId: 'ph-finalizado', progress: '100', comment: '' }).success).toBe(true);
  });

  it('un cambio sin diferencias se rechaza; sólo el porcentaje o un retroceso se admiten', () => {
    expect(issues(schema.safeParse({ phaseId: 'ph-diseno', progress: '10', comment: '' }))).toEqual({ progress: 'Cambia la fase o el porcentaje.' });
    expect(schema.safeParse({ phaseId: 'ph-diseno', progress: '15', comment: '' }).success).toBe(true);
  });

  it('minimumProgressFor lee el parámetro por código; sin regla, null', () => {
    expect(minimumProgressFor('FINALIZADO', { FINALIZADO: { progresoMinimo: 100 } })).toBe('100');
    expect(minimumProgressFor('DISENO', { FINALIZADO: { progresoMinimo: 100 } })).toBeNull();
    expect(minimumProgressFor(undefined, {})).toBeNull();
  });
});

describe('projectProductFormSchema (RN-03.57)', () => {
  it('exige producto, cantidad ≥ 0 y unidad', () => {
    expect(issues(projectProductFormSchema.safeParse({ productId: '', quantity: '-2', unitId: '', statusId: '', notes: '' }))).toEqual({
      productId: 'Elige un producto.',
      unitId: 'Este campo es obligatorio.',
      quantity: 'Debe ser mayor o igual que 0.',
    });
    expect(projectProductFormSchema.safeParse({ productId: 'p', quantity: '0', unitId: 'u', statusId: '', notes: '' }).success).toBe(true);
  });
});
