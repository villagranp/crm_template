import { QueryClient, QueryClientProvider, type QueryKey, type UseMutationResult } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerKeys } from '@/features/crm/customers/customers.queries';
import { forecastKeys, useSaveForecastLines } from '@/features/crm/forecast/forecast.queries';
import { opportunityKeys, useChangeOpportunityStage, useCreateOpportunity } from '@/features/crm/opportunities/opportunities.queries';
import { useCreateProjectProduct, useDeleteProjectProduct, useUpdateProjectProduct } from '@/features/crm/projects/products/project-products.queries';
import {
  projectKeys,
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
  useUpdateClassification,
  useUpdateProject,
} from '@/features/crm/projects/projects.queries';

/**
 * Coherencia de la caché entre submódulos del CRM (revisión E5 del Módulo 3,
 * AGENTS §9.7 y §9.12): con `staleTime` de 30 s, una mutación de un submódulo
 * tiene que invalidar lo que otro submódulo muestra de ella.
 */

vi.mock('@/features/crm/projects/projects.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createProject: vi.fn(() => Promise.resolve({ id: 'p-2' })),
  updateProject: vi.fn(() => Promise.resolve({ id: 'p-1' })),
  deleteProject: vi.fn(() => Promise.resolve(undefined)),
  duplicateProject: vi.fn(() => Promise.resolve({ id: 'p-2' })),
  updateClassification: vi.fn(() => Promise.resolve({})),
}));
vi.mock('@/features/crm/projects/products/project-products.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createProjectProduct: vi.fn(() => Promise.resolve({})),
  updateProjectProduct: vi.fn(() => Promise.resolve({})),
  deleteProjectProduct: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('@/features/crm/opportunities/opportunities.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createOpportunity: vi.fn(() => Promise.resolve({})),
  changeOpportunityStage: vi.fn(() => Promise.resolve({})),
}));
vi.mock('@/features/crm/forecast/forecast.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveForecastLines: vi.fn(() => Promise.resolve({ created: 1, updated: 0, unchanged: 0, lines: [] })),
}));

const KEYS = {
  forecastRows: forecastKeys.rows({ mode: 'WINDOW' }),
  forecastTotals: forecastKeys.totals({ mode: 'WINDOW' }),
  opportunities: opportunityKeys.list({ page: 1 }),
  opportunityBoard: opportunityKeys.board({ stageId: 's-1' }),
  customerProjects: customerKeys.projects('c-1', { page: 1 }),
  customerDetail: customerKeys.detail('c-1'),
  teamProjects: projectKeys.teamList({ page: 1 }),
} satisfies Record<string, QueryKey>;

type CacheName = keyof typeof KEYS;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const key of Object.values(KEYS)) queryClient.setQueryData(key, { seeded: true });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

async function invalidatedAfter<TVariables>(
  useHook: () => UseMutationResult<unknown, Error, TVariables>,
  variables: TVariables,
): Promise<CacheName[]> {
  const { queryClient, Wrapper } = setup();
  const { result } = renderHook(useHook, { wrapper: Wrapper });
  await act(() => result.current.mutateAsync(variables));
  return (Object.keys(KEYS) as CacheName[]).filter((name) => queryClient.getQueryState(KEYS[name])?.isInvalidated);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('invalidaciones entre submódulos del CRM', () => {
  it('eliminar un proyecto refresca forecast, oportunidades y la ficha del cliente (AC-03.14)', async () => {
    expect(await invalidatedAfter(() => useDeleteProject('p-1'), undefined)).toEqual([
      'forecastRows',
      'forecastTotals',
      'opportunities',
      'opportunityBoard',
      'customerProjects',
      'teamProjects',
    ]);
  });

  it('cambiar la clasificación refresca el forecast (tonelajes) y la ficha del cliente', async () => {
    expect(await invalidatedAfter(() => useUpdateClassification('p-1'), {} as never)).toEqual([
      'forecastRows',
      'forecastTotals',
      'customerProjects',
      'teamProjects',
    ]);
  });

  it('crear, editar o duplicar un proyecto refresca los proyectos de la ficha del cliente', async () => {
    expect(await invalidatedAfter(() => useCreateProject(), {} as never)).toEqual(['customerProjects', 'teamProjects']);
    expect(await invalidatedAfter(() => useUpdateProject('p-1'), {} as never)).toEqual([
      'forecastRows',
      'forecastTotals',
      'opportunities',
      'opportunityBoard',
      'customerProjects',
      'teamProjects',
    ]);
    expect(await invalidatedAfter(() => useDuplicateProject('p-1'), {} as never)).toEqual([
      'forecastRows',
      'forecastTotals',
      'customerProjects',
      'teamProjects',
    ]);
  });

  it.each([
    ['asociar', () => useCreateProjectProduct('p-1'), {}],
    ['editar', () => useUpdateProjectProduct('p-1'), { projectProductId: 'pp-1', input: {} }],
    ['quitar', () => useDeleteProjectProduct('p-1'), 'pp-1'],
  ] as const)('%s un producto refresca el forecast y las oportunidades', async (_label, useHook, variables) => {
    expect(await invalidatedAfter(useHook as () => UseMutationResult<unknown, Error, unknown>, variables)).toEqual([
      'forecastRows',
      'forecastTotals',
      'opportunities',
      'opportunityBoard',
      'customerProjects',
      'teamProjects',
    ]);
  });

  it('las mutaciones de oportunidades refrescan los proyectos de la ficha del cliente', async () => {
    const expected = ['opportunities', 'opportunityBoard', 'customerProjects', 'teamProjects'];
    expect(await invalidatedAfter(() => useCreateOpportunity('p-1'), {} as never)).toEqual(expected);
    expect(await invalidatedAfter(() => useChangeOpportunityStage('o-1', 'p-1'), {} as never)).toEqual(expected);
  });

  it('guardar el forecast refresca la vista de equipo y la ficha del cliente', async () => {
    const lines = [{ projectId: 'p-1', productId: 'pr-1', year: 2027, month: 1, quantity: '1' }];
    expect(await invalidatedAfter(() => useSaveForecastLines(), lines)).toEqual([
      'forecastRows',
      'forecastTotals',
      'customerProjects',
      'teamProjects',
    ]);
  });
});
