import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { bodyOf, FORM_OPTIONS, project, READ_ONLY, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { ProjectClassificationSection } from './ProjectClassificationSection';

const RULE = {
  id: 'r-vivienda',
  scope: 'PROJECT_TYPE',
  factor: '0.03500000',
  fromUnit: { id: 'u-m2', code: 'M2', symbol: 'm²' },
  toUnit: { id: 'u-ton', code: 'TON', symbol: 't' },
};

async function choose(dialog: HTMLElement, label: RegExp, option: string) {
  await userEvent.click(within(dialog).getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.editar']);
});
afterEach(signOut);

describe('ProjectClassificationSection (F-15)', () => {
  it('clasifica por regla con la vista previa de /unit-conversions/resolve, sin factores propios (AC-03.31, AC-03.35, PF-03.48)', async () => {
    const fetchMock = mockApi({
      'GET /unit-conversions/resolve': () => jsonResponse({ rule: RULE }),
      'PUT /projects/p-1/classification': () => jsonResponse({}),
      'GET /projects/p-1': () => jsonResponse(project()),
    });

    renderWithProviders(<ProjectClassificationSection project={project()} options={FORM_OPTIONS} />);
    expect(screen.getByText('Sin clasificar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clasificar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clasificar proyecto' });

    await userEvent.click(within(dialog).getByRole('combobox', { name: /Tipo de proyecto/ }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Sin especificar', 'Vivienda', 'Industrial']);
    await userEvent.click(screen.getByRole('option', { name: 'Vivienda' }));
    await choose(dialog, /Unidad de medida/, 'Metro cuadrado (m²)');
    await userEvent.type(within(dialog).getByLabelText(/Cantidad estimada/), '1200');
    await userEvent.click(within(dialog).getByLabelText('Por regla'));

    expect(await within(dialog).findByText(/Regla aplicable: Por tipo de proyecto, 1 m² = 0\.035 t\. Tonelaje estimado: 42\.00 t\./)).toBeInTheDocument();
    const resolveUrl = new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/unit-conversions/resolve'))?.[0]), 'http://localhost');
    expect(resolveUrl.searchParams.get('fromUnitId')).toBe('u-m2');
    expect(resolveUrl.searchParams.get('projectTypeId')).toBe('pt-vivienda');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar clasificación' }));
    await waitFor(() => expect(callsTo(fetchMock, 'PUT', '/projects/p-1/classification')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/projects/p-1/classification')[0])).toEqual({
      projectTypeId: 'pt-vivienda',
      sectorId: null,
      measureUnitId: 'u-m2',
      estimatedQuantity: '1200',
      tonnageMode: 'RULE',
    });
    expect(await screen.findByText('Clasificación guardada.')).toBeInTheDocument();
  });

  it('sin regla aplicable avisa y sugiere Manual o Sin estimación (AC-03.32)', async () => {
    mockApi({ 'GET /unit-conversions/resolve': () => jsonResponse({ rule: null }) });

    renderWithProviders(<ProjectClassificationSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clasificar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Por regla'));
    await choose(dialog, /Unidad de medida/, 'Varilla (var)');

    expect(await within(dialog).findByText('No hay una regla de conversión de esta unidad a t. Elige "Manual" o "Sin estimación".')).toBeInTheDocument();
  });

  it('modo manual envía el tonelaje y deja la regla al backend (AC-03.33); un 422 del servidor se explica', async () => {
    const fetchMock = mockApi({
      'PUT /projects/p-1/classification': () =>
        errorResponse(422, 'CONVERSION_RULE_NOT_FOUND', [{ field: 'measureUnitId', code: 'CONVERSION_RULE_NOT_FOUND', fromUnitId: 'u', toUnitCode: 'TON' }]),
    });

    renderWithProviders(<ProjectClassificationSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clasificar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Manual'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar clasificación' }));
    expect(await within(dialog).findByText('Este campo es obligatorio.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Tonelaje estimado/), '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar clasificación' }));
    await waitFor(() => expect(callsTo(fetchMock, 'PUT', '/projects/p-1/classification')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/projects/p-1/classification')[0])).toEqual({
      projectTypeId: null,
      sectorId: null,
      measureUnitId: null,
      estimatedQuantity: null,
      tonnageMode: 'MANUAL',
      manualTonnage: '50',
    });
    expect(await within(dialog).findByText(/No hay una regla de conversión aplicable a esa unidad/)).toBeInTheDocument();
  });

  it('muestra la clasificación guardada (modo, regla y tonelaje del backend) y, sin canEdit, no ofrece editarla', () => {
    mockApi({});
    const classified = project({
      capabilities: READ_ONLY,
      classification: {
        projectType: { id: 'pt-vivienda', code: 'VIVIENDA', label: 'Vivienda', isActive: true },
        sector: { id: 'sc-x', code: 'X', label: 'Sector retirado', isActive: false },
        measureUnit: { id: 'u-m2', code: 'M2', symbol: 'm²', dimension: 'AREA' },
        estimatedQuantity: '1200.0000',
        tonnageMode: 'RULE',
        conversion: { ruleId: 'r', scope: 'PROJECT_TYPE', factor: '0.03500000', toUnit: { id: 'u-ton', code: 'TON' } },
        estimatedTonnage: '42.0000',
      },
    });

    renderWithProviders(<ProjectClassificationSection project={classified} options={FORM_OPTIONS} />);
    expect(screen.getByText('Por regla')).toBeInTheDocument();
    expect(screen.getByText('Por tipo de proyecto · factor 0.035')).toBeInTheDocument();
    expect(screen.getByText('42.00 t')).toBeInTheDocument();
    expect(screen.getByText('1,200 m²')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar clasificación' })).not.toBeInTheDocument();
  });
});
