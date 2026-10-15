import { describe, expect, it } from 'vitest';

import {
  familyFormSchema,
  productFormSchema,
  toSortOrder,
  unitFormSchema,
  type FamilyFormValues,
  type ProductFormValues,
  type UnitFormValues,
} from './products.schemas';

/** Los patrones replican `backend/src/modules/products/master-data-rules.ts`. */

const family: FamilyFormValues = { code: 'ACERO', name: 'Acero', description: '', sortOrder: '' };
const product: ProductFormValues = {
  sku: 'VAR-3',
  description: 'Varilla corrugada 3/8',
  familyId: 'f-1',
  baseUnitId: 'u-1',
};
const unit: UnitFormValues = { code: 'TON', name: 'Tonelada', symbol: 't', dimension: 'MASS', sortOrder: '' };

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('familyFormSchema', () => {
  it('recorta y pasa el código a mayúsculas, como el backend', () => {
    const result = familyFormSchema.parse({ ...family, code: '  acero-largo_2 ' });
    expect(result.code).toBe('ACERO-LARGO_2');
  });

  it('exige que el código empiece por letra o dígito', () => {
    expect(familyFormSchema.safeParse({ ...family, code: '-ACERO' }).success).toBe(false);
    expect(familyFormSchema.safeParse({ ...family, code: '_ACERO' }).success).toBe(false);
    expect(familyFormSchema.safeParse({ ...family, code: '9ACERO' }).success).toBe(true);
  });

  it('rechaza caracteres fuera de letras, dígitos, guion y guion bajo', () => {
    expect(familyFormSchema.safeParse({ ...family, code: 'ACERO LARGO' }).success).toBe(false);
    expect(familyFormSchema.safeParse({ ...family, code: 'ACERO/1' }).success).toBe(false);
  });

  it('limita el orden a 0–100000', () => {
    expect(familyFormSchema.safeParse({ ...family, sortOrder: '100000' }).success).toBe(true);
    expect(firstMessage(familyFormSchema.safeParse({ ...family, sortOrder: '100001' }))).toBe(
      'Debe estar entre 0 y 100,000.',
    );
    expect(familyFormSchema.safeParse({ ...family, sortOrder: '-1' }).success).toBe(false);
    expect(familyFormSchema.safeParse({ ...family, sortOrder: '1.5' }).success).toBe(false);
  });
});

describe('productFormSchema', () => {
  it('pasa el SKU a mayúsculas y admite espacios internos y . _ - /', () => {
    expect(productFormSchema.parse({ ...product, sku: ' var 3/8.a_b-c ' }).sku).toBe('VAR 3/8.A_B-C');
  });

  it('exige que el SKU empiece por letra o dígito', () => {
    expect(productFormSchema.safeParse({ ...product, sku: '/VAR' }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...product, sku: '.VAR' }).success).toBe(false);
  });

  it('rechaza caracteres que el backend no acepta', () => {
    for (const sku of ['VAR#3', 'VAR,3', 'VAR\t3', 'VARÑ', 'VAR+3']) {
      expect(productFormSchema.safeParse({ ...product, sku }).success, sku).toBe(false);
    }
  });

  it('limita el SKU a 60 caracteres', () => {
    expect(productFormSchema.safeParse({ ...product, sku: 'A'.repeat(60) }).success).toBe(true);
    expect(productFormSchema.safeParse({ ...product, sku: 'A'.repeat(61) }).success).toBe(false);
  });
});

describe('unitFormSchema', () => {
  it('pasa el código a mayúsculas y exige que empiece por letra o dígito', () => {
    expect(unitFormSchema.parse({ ...unit, code: 'm2' }).code).toBe('M2');
    expect(unitFormSchema.safeParse({ ...unit, code: '_M2' }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...unit, code: 'M-2' }).success).toBe(false);
  });

  it('limita el orden a 0–100000', () => {
    expect(unitFormSchema.safeParse({ ...unit, sortOrder: '100001' }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...unit, sortOrder: '0' }).success).toBe(true);
  });
});

describe('toSortOrder', () => {
  it('vacío no se envía; el resto es número', () => {
    expect(toSortOrder('')).toBeUndefined();
    expect(toSortOrder(' 12 ')).toBe(12);
  });
});
