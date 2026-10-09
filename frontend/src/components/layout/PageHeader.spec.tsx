import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('pinta el título como h1 con el contexto opcional en el mismo encabezado', () => {
    renderWithProviders(<PageHeader title="Equipos comerciales" context="Catálogos" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Equipos comerciales — Catálogos',
    );
  });

  it('pone las migas DEBAJO del título, con enlaces salvo la última', () => {
    renderWithProviders(
      <PageHeader
        title="Usuarios"
        subtitle="Alta y edición de usuarios."
        breadcrumbs={[
          { label: 'Inicio', to: '/' },
          { label: 'Administración' },
          { label: 'Usuarios' },
        ]}
      />,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    const crumbs = screen.getByRole('navigation', { name: 'Ruta de navegación' });
    expect(heading.compareDocumentPosition(crumbs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(crumbs).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(within(crumbs).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(within(crumbs).getByText('Usuarios')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Alta y edición de usuarios.')).toBeInTheDocument();
  });

  it('muestra las acciones de la página', () => {
    renderWithProviders(
      <PageHeader title="Roles" actions={<button type="button">Nuevo rol</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Nuevo rol' })).toBeInTheDocument();
  });
});
