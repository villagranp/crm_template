import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ImportStatus } from './customer-imports.api';
import { customerImportKeys, useRefreshRowsOnStatusChange } from './customer-imports.queries';

function setup(initial: ImportStatus) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = renderHook(({ status }: { status: ImportStatus }) => useRefreshRowsOnStatusChange('imp-1', status), {
    wrapper,
    initialProps: { status: initial },
  });
  const keys = () => invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  return { hook, keys };
}

describe('useRefreshRowsOnStatusChange', () => {
  it('al terminar una importación recarga filas, historial y listas de clientes', () => {
    const { hook, keys } = setup('IMPORTING');
    hook.rerender({ status: 'COMPLETED_WITH_ERRORS' });
    expect(keys()).toEqual([
      JSON.stringify(customerImportKeys.rowsOf('imp-1')),
      JSON.stringify(customerImportKeys.lists()),
      JSON.stringify(['crm', 'customers']),
    ]);
  });

  it('otros cambios de estado solo recargan las filas', () => {
    const { hook, keys } = setup('VALIDATED');
    hook.rerender({ status: 'CANCELLED' });
    expect(keys()).toEqual([JSON.stringify(customerImportKeys.rowsOf('imp-1'))]);
  });
});
