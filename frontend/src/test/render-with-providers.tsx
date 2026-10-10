import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { lightTheme } from '@/theme';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Historial inicial del enrutador en memoria (por defecto, `/`). */
  initialEntries?: string[];
}

/**
 * Arnés de pruebas: renderiza con el tema real, un cliente de consultas nuevo
 * (para que no se filtre caché entre casos) y un enrutador en memoria.
 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}): RenderResult {
  const { initialEntries, ...renderOptions } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider theme={lightTheme}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
