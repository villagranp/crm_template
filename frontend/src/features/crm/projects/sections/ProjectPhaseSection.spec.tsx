import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { bodyOf, FORM_OPTIONS, page, project, READ_ONLY, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { ProjectPhaseSection } from './ProjectPhaseSection';

const HISTORY = [
  {
    id: 'ph-2',
    fromPhase: { id: 'ph-diseno', code: 'DISENO', label: 'Diseño' },
    toPhase: { id: 'ph-cotizacion', code: 'COTIZACION', label: 'Cotización' },
    fromProgress: '10.00',
    toProgress: '30.00',
    comment: 'Cliente pidió cotización',
    changedBy: { id: 'u-1', displayName: 'Ana Asesora' },
    changedAt: '2026-10-05T15:00:00.000Z',
  },
  {
    id: 'ph-1',
    fromPhase: null,
    toPhase: { id: 'ph-diseno', code: 'DISENO', label: 'Diseño' },
    fromProgress: null,
    toProgress: '10.00',
    comment: null,
    changedBy: { id: 'u-1', displayName: 'Ana Asesora' },
    changedAt: '2026-09-01T15:00:00.000Z',
  },
];

async function choosePhase(dialog: HTMLElement, label: string) {
  await userEvent.click(within(dialog).getByRole('combobox', { name: /Fase/ }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.editar']);
});
afterEach(signOut);

describe('ProjectPhaseSection (F-16)', () => {
  it('muestra los pasos del catálogo en orden, el avance con texto y el historial (AC-03.36, AC-03.40)', async () => {
    mockApi({ 'GET /projects/p-1/phase-history': () => page(HISTORY) });

    renderWithProviders(<ProjectPhaseSection project={project()} options={FORM_OPTIONS} />);
    expect(screen.getByText('Fase actual: Diseño')).toBeInTheDocument();
    expect(screen.getByText('Avance 10%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de la fase: 10%' })).toHaveAttribute('aria-valuenow', '10');
    const steps = within(screen.getByLabelText('Fases del cliente'));
    expect(['Diseño', 'Cotización', 'Construcción', 'Finalizado'].every((label) => steps.getByText(label))).toBe(true);

    expect(await screen.findByText('Diseño 10% → Cotización 30%')).toBeInTheDocument();
    expect(screen.getByText('Cliente pidió cotización')).toBeInTheDocument();
    expect(screen.getByText('Alta en Diseño 10%')).toBeInTheDocument();
  });

  it('al cambiar de fase propone su porcentaje por defecto y envía fase, porcentaje y comentario (RN-03.34, AC-03.36)', async () => {
    const fetchMock = mockApi({
      'GET /projects/p-1/phase-history': () => page([]),
      'POST /projects/p-1/phase-changes': () => jsonResponse({}, 201),
      'GET /projects/p-1': () => jsonResponse(project()),
    });

    renderWithProviders(<ProjectPhaseSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar fase' }));
    const dialog = await screen.findByRole('dialog', { name: 'Actualizar fase' });
    await choosePhase(dialog, 'Cotización');
    expect(within(dialog).getByLabelText(/Porcentaje de avance/)).toHaveValue('30');
    await userEvent.type(within(dialog).getByLabelText(/Comentario/), 'Arranca cotización');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar fase' }));

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/projects/p-1/phase-changes')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects/p-1/phase-changes')[0])).toEqual({
      phaseId: 'ph-cotizacion',
      progress: '30',
      comment: 'Arranca cotización',
    });
    expect(await screen.findByText('Fase actualizada.')).toBeInTheDocument();
  });

  it('aplica la regla de avance antes de enviar y explica el 422 del servidor (AC-03.38)', async () => {
    const fetchMock = mockApi({
      'GET /projects/p-1/phase-history': () => page([]),
      'POST /projects/p-1/phase-changes': () =>
        errorResponse(422, 'PHASE_PROGRESS_RULE', [{ field: 'progress', code: 'PHASE_PROGRESS_RULE', message: 'x', phaseCode: 'CONSTRUCCION', minimumProgress: 50 }]),
    });

    renderWithProviders(<ProjectPhaseSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar fase' }));
    const dialog = await screen.findByRole('dialog');
    await choosePhase(dialog, 'Finalizado');
    const progress = within(dialog).getByLabelText(/Porcentaje de avance/);
    await userEvent.clear(progress);
    await userEvent.type(progress, '90');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar fase' }));
    expect(await within(dialog).findByText('Esta fase exige al menos 100%.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/projects/p-1/phase-changes')).toHaveLength(0);

    // Una regla que el parámetro cambió en el servidor: manda el backend.
    await choosePhase(dialog, 'Construcción');
    await userEvent.clear(progress);
    await userEvent.type(progress, '40');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar fase' }));
    expect(await within(dialog).findByText('El porcentaje no cumple la regla de avance de la fase.')).toBeInTheDocument();
    expect(within(dialog).getByText('Esta fase exige al menos 50%.')).toBeInTheDocument();
  });

  it('sin cambios no se envía (PHASE_UNCHANGED); sin canEdit no hay "Actualizar fase"', async () => {
    mockApi({ 'GET /projects/p-1/phase-history': () => page([]) });

    const { unmount } = renderWithProviders(<ProjectPhaseSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar fase' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar fase' }));
    expect(await within(dialog).findByText('Cambia la fase o el porcentaje.')).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProjectPhaseSection project={project({ capabilities: READ_ONLY })} options={FORM_OPTIONS} />);
    expect(screen.queryByRole('button', { name: 'Actualizar fase' })).not.toBeInTheDocument();
  });
});
