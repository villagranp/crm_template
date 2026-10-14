import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api';
import { renderWithProviders } from '@/test/render-with-providers';

import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('muestra valor, pie, hora de actualización y el enlace "Ver …" a su listado', () => {
    renderWithProviders(
      <KpiCard
        label="Proyectos activos"
        icon={<AssignmentOutlinedIcon />}
        value="42"
        foot="Del mes"
        generatedAt={new Date(2026, 9, 13, 16, 4).toISOString()}
        href="/proyectos?active=true"
      />,
    );

    const card = screen.getByRole('region', { name: 'Proyectos activos' });
    expect(within(card).getByText('42')).toBeInTheDocument();
    expect(within(card).getByText('Del mes')).toBeInTheDocument();
    expect(within(card).getByText('Actualizado 16:04')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /ver proyectos activos/i })).toHaveAttribute(
      'href',
      '/proyectos?active=true',
    );
  });

  it('sin ruta registrada no hay enlace y muestra la nota de disponibilidad (RN-01.19)', () => {
    renderWithProviders(
      <KpiCard
        label="Actividades vencidas"
        icon={<AssignmentOutlinedIcon />}
        value="5"
        href={null}
      />,
    );

    const card = screen.getByRole('region', { name: 'Actividades vencidas' });
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(card).getByText('Listado disponible cuando se habilite el módulo'),
    ).toBeInTheDocument();
  });

  it('cargando: esqueleto y sin valor', () => {
    renderWithProviders(
      <KpiCard label="Forecast" icon={<AssignmentOutlinedIcon />} isLoading value="1 t" />,
    );

    const card = screen.getByRole('region', { name: 'Forecast' });
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).queryByText('1 t')).not.toBeInTheDocument();
  });

  it('error: mensaje sin detalles internos, referencia y reintento (RN-01.8)', async () => {
    const onRetry = vi.fn();
    const error = new ApiError({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'SQL roto',
      correlationId: 'corr-42',
    });
    renderWithProviders(
      <KpiCard
        label="Forecast"
        icon={<AssignmentOutlinedIcon />}
        error={error}
        onRetry={onRetry}
        href="/proyectos/forecast"
      />,
    );

    const card = screen.getByRole('region', { name: 'Forecast' });
    expect(within(card).getByText(/error en el servidor/i)).toBeInTheDocument();
    expect(within(card).queryByText(/SQL roto/)).not.toBeInTheDocument();
    expect(within(card).getByText('Referencia: corr-42')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
