import { describe, expect, it } from 'vitest';

import { initialsOf, recordsSubtitle } from './admin-format';

describe('initialsOf', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    expect(initialsOf('Dirección comercial')).toBe('DC');
    expect(initialsOf('Ventas Centro y Occidente')).toBe('VC');
  });

  it('ignora signos y espacios sobrantes', () => {
    expect(initialsOf('  «Mesa»   de ayuda ')).toBe('MD');
    expect(initialsOf('ana')).toBe('A');
    expect(initialsOf('—')).toBe('');
  });
});

describe('recordsSubtitle', () => {
  it('antepone el total con singular o plural', () => {
    expect(recordsSubtitle(5, 'Equipos y jerarquías.')).toBe('5 registros · Equipos y jerarquías.');
    expect(recordsSubtitle(1, 'Equipos y jerarquías.')).toBe('1 registro · Equipos y jerarquías.');
    expect(recordsSubtitle(2, 'Valores.', ['parámetro', 'parámetros'])).toBe(
      '2 parámetros · Valores.',
    );
  });

  it('sin total (cargando o error) muestra sólo la descripción', () => {
    expect(recordsSubtitle(undefined, 'Equipos y jerarquías.')).toBe('Equipos y jerarquías.');
  });
});
