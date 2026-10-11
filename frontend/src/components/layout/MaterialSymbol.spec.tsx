import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { MaterialSymbol } from './MaterialSymbol';

describe('MaterialSymbol', () => {
  it('resuelve el icono `business` del módulo Clientes', () => {
    renderWithProviders(<MaterialSymbol name="business" />);
    expect(screen.getByTestId('BusinessOutlinedIcon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('un nombre desconocido cae en el icono por defecto', () => {
    renderWithProviders(<MaterialSymbol name="no_existe" />);
    expect(screen.getByTestId('ChevronRightIcon')).toBeInTheDocument();
  });
});
