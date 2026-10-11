import { assertCustomerOutcome } from './customer-outcome';
import type { DuplicateCandidate, ValidationOutcome } from './customer-validation.service';

function candidate(id: string | null, rule: DuplicateCandidate['rule'] = 'nit'): DuplicateCandidate {
  return {
    rule,
    reason: rule === 'nit' ? 'TAX_ID' : 'LEGAL_NAME',
    candidate: {
      id,
      crmCode: 'CLI-000001',
      customerCode: null,
      legalName: 'Cliente',
      country: { isoCode: 'GT', name: 'Guatemala' },
      salesOwnerName: 'Ana',
      isVisible: id !== null,
      isDeleted: false,
    },
  };
}

function outcome(overrides: Partial<ValidationOutcome> = {}): ValidationOutcome {
  return { errors: [], duplicates: [], blockingDuplicates: [], codeConflict: null, normalized: null, ...overrides };
}

describe('assertCustomerOutcome', () => {
  it('422 con el código de la primera incidencia y todas en details', () => {
    expect(() =>
      assertCustomerOutcome(
        outcome({
          errors: [
            { field: 'phone', code: 'INVALID_PHONE_FORMAT', message: 'x' },
            { field: 'taxId', code: 'INVALID_TAX_ID_FORMAT', message: 'y' },
          ],
        }),
        undefined,
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_PHONE_FORMAT', details: [expect.objectContaining({ field: 'phone' }), expect.objectContaining({ field: 'taxId' })] }));
  });

  it('código ocupado antes que los duplicados', () => {
    expect(() =>
      assertCustomerOutcome(outcome({ codeConflict: { customerId: null, crmCode: 'CLI-1', isDeleted: true }, duplicates: [candidate('a')] }), undefined),
    ).toThrow(expect.objectContaining({ code: 'CUSTOMER_CODE_TAKEN', details: [{ field: 'customerCode', customerId: null, crmCode: 'CLI-1', isDeleted: true }] }));
  });

  it('BLOQUEAR no se puede confirmar', () => {
    expect(() => assertCustomerOutcome(outcome({ blockingDuplicates: [candidate('a', 'razonSocialNormalizada')] }), ['a'])).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_BLOCKED' }),
    );
  });

  it('avisos: 409 sin confirmar; pasa con todos los visibles confirmados', () => {
    const warnings = [candidate('a'), candidate(null)];
    expect(() => assertCustomerOutcome(outcome({ duplicates: warnings }), undefined)).toThrow(
      expect.objectContaining({
        code: 'POSSIBLE_DUPLICATE',
        details: [expect.objectContaining({ rule: 'nit', reason: 'TAX_ID', candidate: expect.objectContaining({ id: 'a' }) }), expect.anything()],
      }),
    );
    expect(() => assertCustomerOutcome(outcome({ duplicates: warnings }), [])).toThrow(expect.objectContaining({ code: 'POSSIBLE_DUPLICATE' }));
    expect(() => assertCustomerOutcome(outcome({ duplicates: warnings }), ['a'])).not.toThrow();
  });
});
