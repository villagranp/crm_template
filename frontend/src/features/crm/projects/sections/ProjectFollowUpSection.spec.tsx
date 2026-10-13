import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { menu, signInWith, signOut } from '../testing/project-fixtures';

import { ProjectFollowUpSection } from './ProjectFollowUpSection';

beforeEach(() => signInWith(['proyectos.ver', 'actividades.ver']));
afterEach(signOut);

describe('ProjectFollowUpSection (AC-03.16, PF-03.23)', () => {
  it.each([
    ['sin el Módulo 4 en el menú', ['proyectos-buscar']],
    ['con la opción del Módulo 4 pero sin sus puntos de entrada', ['proyectos-buscar', 'actividad-actividades']],
  ])('%s: estado informativo y sólo se consulta el menú', async (_case, keys) => {
    const fetchMock = mockApi({ 'GET /me/menu': () => jsonResponse(menu(keys)) });

    renderWithProviders(<ProjectFollowUpSection />);
    expect(await screen.findByText('El seguimiento comercial estará disponible con el módulo de Actividad comercial.')).toBeInTheDocument();
    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname.replace(/^\/api\/v1/, ''));
    expect(paths.every((path) => path === '/me/menu')).toBe(true);
  });
});
