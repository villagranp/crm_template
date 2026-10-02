import { describe, expect, it } from 'vitest';

import { ag, brand } from './tokens';
import { darkTheme, lightTheme } from './theme';

describe('tema Grupo AG', () => {
  it('usa una base de espaciado de 8 px', () => {
    expect(lightTheme.spacing(2)).toBe('16px');
  });

  it('toma el azul AG como color primario en tema claro', () => {
    expect(lightTheme.palette.primary.main).toBe(ag.blue);
  });

  it('sube el CTA a brand-300 en tema oscuro para mantener contraste', () => {
    expect(darkTheme.palette.primary.main).toBe(brand[300]);
  });

  it('usa la base azul-negra del spec en tema oscuro, nunca gris neutro', () => {
    expect(darkTheme.palette.background.default).toBe('#0C1424');
  });

  it('no aplica mayúsculas automáticas a las etiquetas de botón', () => {
    expect(lightTheme.typography.button.textTransform).toBe('none');
  });

  it('respeta los breakpoints mobile-first del spec', () => {
    expect(lightTheme.breakpoints.values.sm).toBe(576);
    expect(lightTheme.breakpoints.values.md).toBe(768);
    expect(lightTheme.breakpoints.values.lg).toBe(992);
  });

  it('nunca usa ease-in en las transiciones de interfaz', () => {
    expect(lightTheme.transitions.easing.easeIn).toBe(lightTheme.transitions.easing.easeOut);
  });
});
