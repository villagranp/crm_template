import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  it('muestra el título y un enlace de vuelta al inicio', () => {
    renderWithProviders(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: /página no encontrada/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/');
  });
});
