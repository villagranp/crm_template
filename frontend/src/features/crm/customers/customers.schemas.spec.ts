import { describe, expect, it } from 'vitest';

import { buildContactFormSchema, buildCustomerFormSchema, FORMULA_MESSAGE, type CustomerFormValues } from './customers.schemas';
import { FORM_OPTIONS, GT, SV } from './testing/customer-fixtures';

const VALID: CustomerFormValues = {
  customerCode: '',
  legalName: 'Ferretería El Sol',
  tradeName: '',
  taxId: '',
  countryId: GT.id,
  city: '',
  address: '',
  phone: '',
  email: '',
  companyTypeId: '',
  statusId: 'st-activo',
  ratingId: '',
  salesOwner: null,
};

function errorsOf(values: Partial<CustomerFormValues>, context: Partial<Parameters<typeof buildCustomerFormSchema>[0]> = {}) {
  const schema = buildCustomerFormSchema({
    requiredFields: FORM_OPTIONS.requiredFields,
    countries: FORM_OPTIONS.countries,
    canChooseOwner: false,
    ...context,
  });
  const result = schema.safeParse({ ...VALID, ...values });
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('buildCustomerFormSchema', () => {
  it('acepta un alta mínima válida', () => {
    expect(errorsOf({})).toEqual({});
  });

  it('exige razón social y país siempre, y los obligatorios de form-options', () => {
    expect(errorsOf({ legalName: '  ', countryId: '' })).toMatchObject({
      legalName: 'Este campo es obligatorio.',
      countryId: 'Este campo es obligatorio.',
    });
    expect(errorsOf({}, { requiredFields: ['email'] })).toMatchObject({ email: 'Este campo es obligatorio.' });
  });

  it('exige el responsable sólo si el usuario puede elegirlo', () => {
    expect(errorsOf({}, { requiredFields: ['salesOwnerId'], canChooseOwner: true })).toMatchObject({ salesOwner: 'Este campo es obligatorio.' });
    expect(errorsOf({}, { requiredFields: ['salesOwnerId'], canChooseOwner: false })).toEqual({});
  });

  it('en el alta no exige el responsable aunque el usuario pueda elegirlo: vacío es el propio usuario (02 §F.4)', () => {
    expect(errorsOf({}, { requiredFields: ['salesOwnerId'], canChooseOwner: true, ownerDefaultsToActor: true })).toEqual({});
  });

  it.each(['=SUMA(A1)', '@cmd', '\tTexto', '\rTexto', '   =1'])('rechaza texto libre que empieza como fórmula: %j (RN-02.32)', (value) => {
    const errors = errorsOf({ legalName: value, tradeName: value, city: value, address: value });
    expect(errors).toMatchObject({ legalName: FORMULA_MESSAGE, tradeName: FORMULA_MESSAGE, city: FORMULA_MESSAGE, address: FORMULA_MESSAGE });
  });

  it('acepta un teléfono con + (la regla de fórmulas sólo afecta al texto libre)', () => {
    expect(errorsOf({ phone: '+502 2222-3333' })).toEqual({});
  });

  it('valida el correo y las longitudes', () => {
    expect(errorsOf({ email: 'no-es-correo' })).toMatchObject({ email: 'Escribe un correo válido.' });
    expect(errorsOf({ legalName: 'x'.repeat(201) })).toMatchObject({ legalName: 'Usa como máximo 200 caracteres.' });
  });

  it('valida NIT normalizado y teléfono contra los patrones del país', () => {
    expect(errorsOf({ taxId: '123-456-7K' })).toEqual({});
    expect(errorsOf({ taxId: 'ABC' })).toHaveProperty('taxId');
    expect(errorsOf({ countryId: SV.id, phone: '12' })).toHaveProperty('phone');
    expect(errorsOf({ countryId: SV.id, phone: '+503 2222-3333' })).toEqual({});
  });

  it('no valida los campos que el usuario no puede editar', () => {
    expect(errorsOf({ taxId: 'ABC' }, { skipFields: new Set(['taxId']) })).toEqual({});
  });
});

describe('buildContactFormSchema', () => {
  const base = { firstName: 'Ana', lastName: 'López', jobTitle: '', phone: '', email: '', isActive: true, comments: '', isPrimary: false };

  it('exige nombre y apellidos y valida el correo', () => {
    const result = buildContactFormSchema(null).safeParse({ ...base, firstName: ' ', email: 'x@' });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['firstName', 'email']));
  });

  it('aplica el patrón de teléfono del país del cliente', () => {
    expect(buildContactFormSchema('[0-9]{8}').safeParse({ ...base, phone: '1234' }).success).toBe(false);
    expect(buildContactFormSchema('[0-9]{8}').safeParse({ ...base, phone: '12345678' }).success).toBe(true);
  });

  it('un contacto inactivo no puede marcarse como principal', () => {
    expect(buildContactFormSchema(null).safeParse({ ...base, isActive: false, isPrimary: true }).success).toBe(false);
  });
});
