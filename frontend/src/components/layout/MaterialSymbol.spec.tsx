import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { MaterialSymbol } from './MaterialSymbol';

describe('MaterialSymbol', () => {
  it('resuelve el icono `business` del módulo Clientes', () => {
    renderWithProviders(<MaterialSymbol name="business" />);
    expect(screen.getByTestId('BusinessOutlinedIcon')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['apartment', 'ApartmentOutlinedIcon'],
    ['groups', 'GroupsOutlinedIcon'],
    ['handshake', 'HandshakeOutlinedIcon'],
    ['trending_up', 'TrendingUpOutlinedIcon'],
  ])('resuelve el icono `%s` del módulo Proyectos y sus opciones', (name, testId) => {
    renderWithProviders(<MaterialSymbol name={name} />);
    expect(screen.getByTestId(testId)).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['event_note', 'EventNoteOutlinedIcon'],
    ['pending_actions', 'PendingActionsOutlinedIcon'],
    ['location_on', 'LocationOnOutlinedIcon'],
    ['task_alt', 'TaskAltOutlinedIcon'],
    ['bar_chart', 'BarChartOutlinedIcon'],
    ['upload_file', 'UploadFileOutlinedIcon'],
  ])(
    'resuelve el icono `%s` de las opciones del CRM que muestra el Panel de control',
    (name, testId) => {
      renderWithProviders(<MaterialSymbol name={name} />);
      expect(screen.getByTestId(testId)).toHaveAttribute('aria-hidden', 'true');
    },
  );

  it('un nombre desconocido cae en el icono por defecto', () => {
    renderWithProviders(<MaterialSymbol name="no_existe" />);
    expect(screen.getByTestId('ChevronRightIcon')).toBeInTheDocument();
  });
});
