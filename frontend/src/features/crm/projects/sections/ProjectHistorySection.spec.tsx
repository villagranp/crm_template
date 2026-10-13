import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { historyEntry, lastQuery, page, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { ProjectHistorySection } from './ProjectHistorySection';

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver']);
});
afterEach(signOut);

describe('ProjectHistorySection (AC-03.13)', () => {
  it('pinta tipo, sujeto, campo antes → después, usuario y fecha', async () => {
    mockApi({
      'GET /projects/p-1/history': () =>
        page([
          historyEntry({ id: 'h-2', kind: 'PHASE', event: null, changes: [{ field: 'phaseId', before: 'Diseño', after: 'Cotización' }], comment: 'Avanza' }),
          historyEntry({ id: 'h-3', kind: 'PRODUCT', subject: { type: 'PROJECT_PRODUCT', id: 'pp-1', label: 'VAR-3' }, actor: null, changes: [{ field: 'quantity', before: '100', after: '120' }] }),
        ]),
    });

    renderWithProviders(<ProjectHistorySection projectId="p-1" />);
    expect(await screen.findByText('Fase: Diseño → Cotización')).toBeInTheDocument();
    expect(screen.getByText('Comentario: Avanza')).toBeInTheDocument();
    expect(screen.getByText('VAR-3')).toBeInTheDocument();
    expect(screen.getByText('Cantidad: 100 → 120')).toBeInTheDocument();
    expect(screen.getByText(/^Sistema · /)).toBeInTheDocument();
  });

  it('filtra por tipo con kind (repetible por comas) y vuelve a la primera página', async () => {
    const fetchMock = mockApi({ 'GET /projects/p-1/history': () => page([]) });

    renderWithProviders(<ProjectHistorySection projectId="p-1" />);
    expect(await screen.findByText('Sin cambios registrados')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/projects/p-1/history').get('kind')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Datos' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/projects/p-1/history').get('kind')).toBe('PROJECT_DATA,CLASSIFICATION,OPPORTUNITY_DATA'));
    await userEvent.click(screen.getByRole('button', { name: 'Fase' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/projects/p-1/history').get('kind')).toBe('PHASE'));
    expect(lastQuery(fetchMock, '/projects/p-1/history').get('page')).toBe('1');
    expect(await screen.findByText('No hay cambios de este tipo.')).toBeInTheDocument();
  });
});
