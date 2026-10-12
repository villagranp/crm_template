import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/api-error';

import { acknowledgeableIds, isDuplicateError, parseDuplicateCandidates } from './duplicates';

const VISIBLE = {
  id: 'c-1',
  crmCode: 'CLI-000001',
  customerCode: 'EST-01',
  legalName: 'Ferretería El Sol S.A.',
  country: { isoCode: 'GT', name: 'Guatemala' },
  salesOwnerName: 'Ana Pérez',
  isVisible: true,
  isDeleted: false,
};

const HIDDEN = {
  id: null,
  crmCode: 'CLI-000002',
  customerCode: null,
  legalName: 'Ferreteria el sol',
  country: { isoCode: 'GT', name: 'Guatemala' },
  salesOwnerName: 'Luis Gómez',
  isVisible: false,
  isDeleted: true,
};

describe('parseDuplicateCandidates', () => {
  it('agrupa por candidato los motivos de varias reglas y conserva el orden', () => {
    const candidates = parseDuplicateCandidates([
      { rule: 'razonSocialNormalizada', reason: 'LEGAL_NAME', candidate: VISIBLE },
      { rule: 'razonSocialNormalizada', reason: 'LEGAL_NAME', candidate: HIDDEN },
      { rule: 'nit', reason: 'TAX_ID', candidate: VISIBLE },
    ]);

    expect(candidates).toEqual([
      {
        key: 'c-1',
        id: 'c-1',
        title: 'CLI-000001 · Ferretería El Sol S.A.',
        details: ['Código de cliente EST-01', 'Guatemala', 'Responsable: Ana Pérez'],
        isVisible: true,
        isDeleted: false,
        reasons: ['LEGAL_NAME', 'TAX_ID'],
      },
      {
        key: 'CLI-000002',
        id: null,
        title: 'CLI-000002 · Ferreteria el sol',
        details: ['Guatemala', 'Responsable: Luis Gómez'],
        isVisible: false,
        isDeleted: true,
        reasons: ['LEGAL_NAME'],
      },
    ]);
  });

  it('admite candidatos de contacto', () => {
    const [contact] = parseDuplicateCandidates([
      {
        rule: 'nombreCompleto',
        reason: 'FULL_NAME',
        candidate: { id: 'k-1', fullName: 'Ana López', jobTitle: 'Compras', isDeleted: false },
      },
    ]);

    expect(contact).toMatchObject({
      id: 'k-1',
      title: 'Ana López',
      details: ['Compras'],
      isVisible: true,
      reasons: ['FULL_NAME'],
    });
  });

  it('ignora entradas mal formadas y motivos desconocidos sin romper', () => {
    expect(parseDuplicateCandidates([null, 'x', { candidate: {} }, { reason: 'LEGAL_NAME' }])).toEqual([]);
    expect(parseDuplicateCandidates([{ reason: 'OTRO', candidate: VISIBLE }])[0]?.reasons).toEqual([]);
  });
});

describe('isDuplicateError / acknowledgeableIds', () => {
  it('reconoce los dos códigos de duplicado y nada más', () => {
    const error = (code: string) => new ApiError({ statusCode: 409, code, message: 'x' });
    expect(isDuplicateError(error('POSSIBLE_DUPLICATE'))).toBe(true);
    expect(isDuplicateError(error('DUPLICATE_BLOCKED'))).toBe(true);
    expect(isDuplicateError(error('CUSTOMER_CODE_TAKEN'))).toBe(false);
    expect(isDuplicateError(new Error('x'))).toBe(false);
  });

  it('sólo confirma los candidatos que tienen id', () => {
    const candidates = parseDuplicateCandidates([
      { reason: 'LEGAL_NAME', candidate: VISIBLE },
      { reason: 'LEGAL_NAME', candidate: HIDDEN },
    ]);
    expect(acknowledgeableIds(candidates)).toEqual(['c-1']);
  });
});
