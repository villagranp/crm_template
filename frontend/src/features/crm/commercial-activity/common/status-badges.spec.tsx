import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { DueBadge } from './DueBadge';
import { StatusChip } from './StatusChip';

describe('StatusChip (RN-04.35)', () => {
  it('acompaña el color con texto: vencida, reprogramada y sin registrar', () => {
    renderWithProviders(<StatusChip label="Pendiente" group="OVERDUE" />);
    expect(screen.getByText('Pendiente · Vencida')).toBeInTheDocument();
    expect(screen.getByTestId('ReportProblemOutlinedIcon')).toBeInTheDocument();
  });

  it('marca la reprogramación y la visita sin registrar como etiquetas adicionales', () => {
    renderWithProviders(<StatusChip label="Reprogramada" group="PENDING" isRescheduled isUnregistered />);
    expect(screen.getAllByText('Reprogramada')).toHaveLength(2);
    expect(screen.getByText('Sin registrar')).toBeInTheDocument();
  });

  it('tacha un cancelado y usa un check en el confirmado', () => {
    const { unmount } = renderWithProviders(<StatusChip label="Cancelada" group="CANCELLED" />);
    expect(screen.getByText('Cancelada')).toHaveStyle({ textDecoration: 'line-through' });
    unmount();
    renderWithProviders(<StatusChip label="Confirmada" group="CONFIRMED" />);
    expect(screen.getByTestId('CheckCircleOutlineIcon')).toBeInTheDocument();
  });
});

describe('DueBadge (RN-04.31)', () => {
  const now = new Date('2026-10-12T10:00:00Z');

  it('vencida: marca, texto relativo y fecha absoluta', () => {
    renderWithProviders(<DueBadge dueAt="2026-10-10T10:00:00Z" bucket="OVERDUE" now={now} />);
    expect(screen.getByText('Vencida')).toBeInTheDocument();
    expect(screen.getByText(/^Venció hace 2 días · /)).toBeInTheDocument();
  });

  it('próxima a vencer y pendiente', () => {
    const { unmount } = renderWithProviders(<DueBadge dueAt="2026-10-12T15:00:00Z" bucket="DUE_SOON" now={now} />);
    expect(screen.getByText('Próxima a vencer')).toBeInTheDocument();
    expect(screen.getByText(/^Vence en 5 h · /)).toBeInTheDocument();
    unmount();
    renderWithProviders(<DueBadge dueAt="2026-10-20T15:00:00Z" bucket="PENDING" now={now} />);
    expect(screen.queryByText('Vencida')).not.toBeInTheDocument();
    expect(screen.getByText(/^Vence en 8 días · /)).toBeInTheDocument();
  });

  it('sin vencimiento o cerrada', () => {
    const { unmount } = renderWithProviders(<DueBadge dueAt={null} bucket="PENDING" now={now} />);
    expect(screen.getByText('Sin vencimiento')).toBeInTheDocument();
    unmount();
    renderWithProviders(<DueBadge dueAt="2026-10-10T10:00:00Z" bucket={null} now={now} />);
    expect(screen.queryByText(/Venció/)).not.toBeInTheDocument();
  });
});
