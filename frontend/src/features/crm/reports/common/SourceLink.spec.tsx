import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { signInWith, signOut } from '../testing/report-fixtures';

import { SourceLink } from './SourceLink';

afterEach(signOut);

describe('SourceLink (05 E.1, AC-05.4, PF-05.37)', () => {
  it('con el permiso .ver de la entidad, el código es enlace a su ficha', () => {
    signInWith(['reportes.ver', 'proyectos.ver']);
    renderWithProviders(
      <SourceLink to="/proyectos/p-1" permission="proyectos.ver" label="Abrir el proyecto PRY-1">
        PRY-1
      </SourceLink>,
    );

    expect(screen.getByRole('link', { name: 'Abrir el proyecto PRY-1' })).toHaveAttribute('href', '/proyectos/p-1');
  });

  it('sin ese permiso, el código es texto', () => {
    signInWith(['reportes.ver']);
    renderWithProviders(
      <SourceLink to="/proyectos/p-1" permission="proyectos.ver">
        PRY-1
      </SourceLink>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('PRY-1')).toBeInTheDocument();
  });
});
