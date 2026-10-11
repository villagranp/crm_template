import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteCustomer } from './customers.api';
import { customerKeys, useDeleteCustomer } from './customers.queries';

vi.mock('./customers.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deleteCustomer: vi.fn(),
}));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDeleteCustomer', () => {
  it('quita la ficha eliminada de la caché e invalida las listas', async () => {
    vi.mocked(deleteCustomer).mockResolvedValue(undefined);
    const { queryClient, Wrapper } = setup();
    const listKey = customerKeys.list({ page: 1, pageSize: 20 });
    queryClient.setQueryData(customerKeys.detail('customer-1'), { id: 'customer-1' });
    queryClient.setQueryData(customerKeys.detail('customer-2'), { id: 'customer-2' });
    queryClient.setQueryData(listKey, { data: [] });

    const { result } = renderHook(() => useDeleteCustomer('customer-1'), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteCustomer).toHaveBeenCalledWith('customer-1');
    expect(queryClient.getQueryState(customerKeys.detail('customer-1'))).toBeUndefined();
    // Solo la ficha eliminada: las demás siguen en caché.
    expect(queryClient.getQueryData(customerKeys.detail('customer-2'))).toEqual({ id: 'customer-2' });
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('si la eliminación falla, la ficha se conserva', async () => {
    vi.mocked(deleteCustomer).mockRejectedValue(new Error('409'));
    const { queryClient, Wrapper } = setup();
    queryClient.setQueryData(customerKeys.detail('customer-1'), { id: 'customer-1' });

    const { result } = renderHook(() => useDeleteCustomer('customer-1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(queryClient.getQueryData(customerKeys.detail('customer-1'))).toEqual({ id: 'customer-1' });
  });
});
