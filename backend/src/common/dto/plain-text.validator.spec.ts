import { isPlainText, normalizeLineBreaks, trimPlainText } from './plain-text.validator';

describe('texto plano', () => {
  it.each([
    ['texto normal', 'Usa siempre el casco.'],
    ['salto de línea y tabulación', 'Línea 1\n\tLínea 2'],
    ['emoji y acentos', 'Atención ⚠️ año'],
  ])('acepta %s', (_n, value) => {
    expect(isPlainText(value)).toBe(true);
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['control C0', 'a\u0007b'],
    ['DEL', 'a\u007Fb'],
    ['VT', 'a\u000Bb'],
    ['RLO', 'a‮b'],
    ['LRI', 'a⁦b'],
    ['ZWSP dentro', 'a​b'],
    ['BOM', 'a﻿b'],
    ['solo ZWSP', '​​'],
    ['solo espacios', '   \n\t '],
    ['solo braille vacío', '⠀⠀'],
    ['solo hangul filler', 'ㅤ'],
    ['no es texto', 42],
  ])('rechaza %s', (_n, value) => {
    expect(isPlainText(value)).toBe(false);
  });

  it('normaliza CRLF y CR a LF antes de contar y recorta', () => {
    expect(normalizeLineBreaks('a\r\nb\rc')).toBe('a\nb\nc');
    expect(trimPlainText({ value: '  a\r\nb  ' })).toBe('a\nb');
    expect(trimPlainText({ value: 5 })).toBe(5);
  });
});
