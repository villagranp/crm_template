import { describe, expect, it } from 'vitest';

import {
  contactFullName,
  customerLabel,
  formatCalendarDate,
  formatDate,
  formatLocation,
  orDash,
  sourceImportLabel,
  taxIdLabelOf,
} from './customer-format';

describe('customer-format', () => {
  it('compone la ubicación sin huecos', () => {
    expect(formatLocation('Mixco', 'Guatemala')).toBe('Mixco, Guatemala');
    expect(formatLocation(null, 'Guatemala')).toBe('Guatemala');
    expect(formatLocation('  ', null)).toBe('—');
  });

  it('usa la etiqueta fiscal del país o NIT por defecto', () => {
    expect(taxIdLabelOf({ taxIdLabel: 'RTN' })).toBe('RTN');
    expect(taxIdLabelOf(null)).toBe('NIT');
  });

  it('nombre completo del contacto y etiqueta del cliente', () => {
    expect(contactFullName({ firstName: ' Ana ', lastName: 'López ' })).toBe('Ana López');
    expect(contactFullName({ firstName: 'Ana', lastName: 'López', fullName: 'Ana María López' })).toBe('Ana María López');
    expect(customerLabel({ crmCode: 'CLI-000001', legalName: 'Peña' })).toBe('CLI-000001 · Peña');
  });

  it('vacíos y fechas inválidas se muestran como guion', () => {
    expect(orDash(null)).toBe('—');
    expect(orDash('x')).toBe('x');
    expect(formatDate('no-fecha')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });

  it('fecha de calendario YYYY-MM-DD sin desplazamiento de zona horaria (DM-31)', () => {
    const expected = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(2026, 11, 1));
    expect(formatCalendarDate('2026-12-01')).toBe(expected);
    expect(formatCalendarDate('2026-02-30')).toBe('—');
    expect(formatCalendarDate('2026-12-01T00:00:00Z')).toBe('—');
    expect(formatCalendarDate(null)).toBe('—');
  });

  it('origen de carga masiva', () => {
    expect(sourceImportLabel({ sourceImport: { id: 'i', code: 'IMP-2026-0007' } })).toBe('Carga masiva IMP-2026-0007');
    expect(sourceImportLabel({ sourceImport: null })).toBeNull();
  });
});
