import { toCsv } from './csv';

describe('toCsv', () => {
  const columns = [{ header: 'Nombre', value: (row: { name: string }) => row.name }];

  it('empieza con BOM y usa CRLF', () => {
    expect(toCsv([{ name: 'Ana' }], columns)).toBe('﻿Nombre\r\nAna\r\n');
  });

  it('escapa comas, comillas y saltos de línea', () => {
    expect(toCsv([{ name: 'Pérez, "Ana"\nB' }], columns)).toContain('"Pérez, ""Ana""\nB"');
  });

  it.each([
    ['a;=1+1', '"a;=1+1"'],
    ['a\t=1+1', '"a\t=1+1"'],
  ])('entrecomilla %j para que ningún separador regional deje una fórmula al inicio de celda', (value, expected) => {
    expect(toCsv([{ name: value }], columns).split('\r\n')[1]).toBe(expected);
  });

  it('entrecomilla y sigue neutralizando: =1;2 → "\'=1;2"', () => {
    expect(toCsv([{ name: '=1;2' }], columns).split('\r\n')[1]).toBe(`"'=1;2"`);
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx'])('neutraliza la fórmula %j', (value) => {
    const line = toCsv([{ name: value }], columns).split('\r\n')[1] ?? '';
    expect(line.replace(/^"/, '').startsWith("'")).toBe(true);
  });
});
