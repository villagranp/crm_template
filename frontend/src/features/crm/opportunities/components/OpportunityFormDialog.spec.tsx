import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bodyOf, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { detail, GT_FORM_OPTIONS } from '../testing/opportunity-fixtures';

import { OpportunityFormDialog, USD_EQUIVALENT_NOTE } from './OpportunityFormDialog';

function api(create: RouteHandler = () => jsonResponse(detail(), 201), extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /opportunities/form-options': () => jsonResponse(GT_FORM_OPTIONS),
    'POST /projects/p-1/opportunities': create,
    ...extra,
  });
}

function renderDialog(onSaved = vi.fn(), opportunity = null as ReturnType<typeof detail> | null) {
  return renderWithProviders(
    <OpportunityFormDialog open projectId="p-1" projectLabel="PRY-2026-00042 · Torre Norte" opportunity={opportunity} onClose={vi.fn()} onSaved={onSaved} />,
  );
}

async function typeAmount(text: string) {
  await userEvent.type(await screen.findByRole('textbox', { name: /Monto estimado/ }), text);
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['oportunidades.ver', 'oportunidades.crear', 'oportunidades.editar']);
});
afterEach(signOut);

describe('OpportunityFormDialog (PF-03.130, AC-03.90, AC-03.93)', () => {
  it('pide las monedas del proyecto, preselecciona la del país y solo ofrece las admitidas', async () => {
    const fetchMock = api();
    renderDialog();

    const currency = await screen.findByRole('combobox', { name: /Moneda/ });
    expect(currency).toHaveTextContent('GTQ · Quetzal');
    const formOptionsCall = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).find((url) => url.pathname.endsWith('/opportunities/form-options'));
    expect(formOptionsCall?.searchParams.get('projectId')).toBe('p-1');

    await userEvent.click(currency);
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'USD · Dólar estadounidense',
      'GTQ · Quetzal',
    ]);
  });

  it('no calcula la conversión: envía monto y moneda y explica que el equivalente se calcula al guardar', async () => {
    const onSaved = vi.fn();
    const fetchMock = api();
    renderDialog(onSaved);

    expect(await screen.findByText(USD_EQUIVALENT_NOTE)).toBeInTheDocument();
    await typeAmount('7750');
    await userEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects/p-1/opportunities')[0])).toEqual({
      opportunityDate: '2026-10-12',
      stageId: 'st-contactado',
      estimatedAmount: '7750',
      currencyCode: 'GTQ',
    });
  });

  it('entrega la respuesta con el aviso EXCHANGE_RATE_STALE a quien abrió el diálogo', async () => {
    const onSaved = vi.fn();
    const warnings = [
      {
        code: 'EXCHANGE_RATE_STALE',
        message: 'x',
        details: { currencyCode: 'GTQ', exchangeRateDate: '2026-08-27', referenceDate: '2026-10-11', ageDays: 45, thresholdDays: 31 },
      },
    ];
    api(() => jsonResponse({ ...detail(), warnings }, 201));
    renderDialog(onSaved);

    await typeAmount('100');
    await userEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ warnings })));
  });

  it('422 EXCHANGE_RATE_NOT_FOUND se explica bajo la moneda: solo USD funciona hasta cargar las tasas (AC-03.89)', async () => {
    api(() => errorResponse(422, 'EXCHANGE_RATE_NOT_FOUND', [{ field: 'currencyCode', code: 'EXCHANGE_RATE_NOT_FOUND', currencyCode: 'GTQ', date: '2026-10-12' }]));
    renderDialog();

    await typeAmount('7750');
    await userEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
    expect(
      await screen.findByText(/No hay tipo de cambio de GTQ vigente al .*2026\. Mientras no se carguen los tipos de cambio, solo se puede registrar la estimación en USD\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('422 CURRENCY_NOT_ALLOWED se pinta bajo la moneda con las admitidas (AC-03.88)', async () => {
    api(() => errorResponse(422, 'CURRENCY_NOT_ALLOWED', [{ field: 'currencyCode', code: 'CURRENCY_NOT_ALLOWED', currencyCode: 'HNL', allowedCurrencyCodes: ['USD', 'GTQ'] }]));
    renderDialog();

    await typeAmount('10');
    await userEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
    expect(await screen.findByText('Moneda no admitida para este proyecto. Usa USD o GTQ.')).toBeInTheDocument();
  });

  it('en la edición muestra la foto guardada y envía solo lo cambiado (RN-03.82)', async () => {
    const onSaved = vi.fn();
    const fetchMock = api(undefined, { 'PATCH /opportunities/o-1': () => jsonResponse(detail()) });
    renderDialog(onSaved, detail());

    expect(await screen.findByText(/Guardado: GTQ 7,750\.00 ≈ USD 1,000\.00\. Tipo de cambio: 7\.75 GTQ por USD, vigente desde el/)).toBeInTheDocument();
    const nextAction = screen.getByRole('textbox', { name: /Siguiente acción/ });
    await userEvent.clear(nextAction);
    await userEvent.type(nextAction, 'Visitar obra');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/opportunities/o-1')[0])).toEqual({ nextAction: 'Visitar obra' });
  });
});
