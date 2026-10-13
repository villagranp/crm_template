import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bodyOf, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { OpportunityDetail } from '../opportunities.api';
import { detail, FORM_OPTIONS, STAGES } from '../testing/opportunity-fixtures';

import { StageChangeDialog } from './StageChangeDialog';

function api(opportunity: OpportunityDetail, stageChange: () => Response = () => jsonResponse(opportunity, 201)) {
  return mockApi({
    'GET /opportunities/o-1': () => jsonResponse(opportunity),
    'GET /opportunities/form-options': () => jsonResponse(FORM_OPTIONS),
    'POST /opportunities/o-1/stage-changes': stageChange,
    'GET /me/menu': () => jsonResponse([]),
  });
}

async function chooseTarget(label: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: /Etapa destino/ }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['oportunidades.ver', 'oportunidades.editar', 'oportunidades.cerrar']);
});
afterEach(signOut);

describe('StageChangeDialog (PF-03.64, AC-03.44, AC-03.51, AC-03.58)', () => {
  it('solo ofrece los destinos de allowedTransitions, en orden', async () => {
    api(detail({ allowedTransitions: [STAGES.perdido, STAGES.contactado, STAGES.ganado] }));
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await userEvent.click(await screen.findByRole('combobox', { name: /Etapa destino/ }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Contactado', 'Ganado', 'Perdido']);
  });

  it('sin oportunidades.cerrar el backend no devuelve etapas cerradas y el diálogo no las ofrece (AC-03.58)', async () => {
    api(detail({ allowedTransitions: [STAGES.contactado] }));
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await userEvent.click(await screen.findByRole('combobox', { name: /Etapa destino/ }));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Contactado']);
  });

  it('a una etapa abierta envía solo destino y comentario', async () => {
    const onChanged = vi.fn();
    const fetchMock = api(detail(), () => jsonResponse(detail({ stage: STAGES.contactado }), 201));
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={onChanged} />);

    await chooseTarget('Contactado');
    expect(screen.queryByRole('group', { name: 'Resultado de la oportunidad' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /Comentario/ }), 'Volvió a pedir información');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar etapa' }));

    expect(await vi.waitFor(() => callsTo(fetchMock, 'POST', '/opportunities/o-1/stage-changes'))).toHaveLength(1);
    expect(bodyOf(callsTo(fetchMock, 'POST', '/opportunities/o-1/stage-changes')[0])).toEqual({ toStageId: STAGES.contactado.id, comment: 'Volvió a pedir información' });
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('al cerrar exige el resultado y lo envía en la misma operación (Parcial 60 %, AC-03.55)', async () => {
    const fetchMock = api(detail());
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await chooseTarget('Ganado');
    expect(screen.getByRole('group', { name: 'Resultado de la oportunidad' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar oportunidad' }));
    expect(await screen.findByText('Elige el resultado.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/opportunities/o-1/stage-changes')).toHaveLength(0);

    await userEvent.click(screen.getByRole('combobox', { name: /Resultado/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Parcial' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Porcentaje adjudicado/ }), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar oportunidad' }));

    await vi.waitFor(() => expect(callsTo(fetchMock, 'POST', '/opportunities/o-1/stage-changes')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'POST', '/opportunities/o-1/stage-changes')[0])).toEqual({
      toStageId: STAGES.ganado.id,
      comment: null,
      result: { outcome: 'PARTIAL', awardedPercent: '60', decisionDate: '2026-10-12', reasonId: null, comments: null },
    });
  });

  it('reabrir avisa de que se anula el resultado y exige comentario (RN-03.42)', async () => {
    api(
      detail({
        stage: STAGES.ganado,
        result: {
          outcome: 'WON',
          outcomeLabel: 'Ganado',
          reason: null,
          awardedPercent: null,
          decisionDate: '2026-10-11',
          comments: null,
          recordedBy: { id: 'u-1', displayName: 'Ana Asesora' },
          recordedAt: '2026-10-11T15:00:00.000Z',
          updatedAt: '2026-10-11T15:00:00.000Z',
          updatedBy: null,
        },
        allowedTransitions: [STAGES.cotizando],
      }),
    );
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await chooseTarget('Cotizando (reabrir)');
    expect(screen.getByText('Al reabrir se anula el resultado vigente (Ganado); queda en su historial.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }));
    expect(await screen.findByText('Escribe el motivo de la reapertura.')).toBeInTheDocument();
  });

  it('pinta los errores del servidor bajo su campo (result.reasonId → Motivo)', async () => {
    api(detail(), () => errorResponse(422, 'RESULT_REASON_REQUIRED', [{ field: 'result.reasonId', code: 'RESULT_REASON_REQUIRED', message: 'x' }]));
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await chooseTarget('Perdido');
    await userEvent.click(screen.getByRole('combobox', { name: /Motivo/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Precio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar oportunidad' }));

    expect(await screen.findByText('Indica el motivo.')).toBeInTheDocument();
    // El mismo error no se repite en la alerta general (revisión E5).
    expect(screen.queryByText('Indica el motivo del resultado.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un error sin campo del formulario se muestra una sola vez, en la alerta general', async () => {
    api(detail(), () => errorResponse(409, 'OPPORTUNITY_STAGE_CONFLICT'));
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await chooseTarget('Contactado');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar etapa' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(1);
  });

  it('sin destinos permitidos lo explica y no deja enviar', async () => {
    api(detail({ stage: STAGES.perdido, allowedTransitions: [] }));
    renderWithProviders(<StageChangeDialog open opportunityId="o-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText('No hay etapas a las que puedas pasar esta oportunidad desde la etapa actual.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar etapa' })).toBeDisabled();
  });
});
