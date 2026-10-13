import type { UseQueryResult } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '@/services/access';
import type { ApiError } from '@/services/api';
import { renderWithProviders } from '@/test/render-with-providers';

import { HeroCard } from './HeroCard';

const PROFILE: Profile = {
  id: 'u-1',
  displayName: 'Ana López',
  email: 'ana@example.test',
  roles: ['asesor'],
  permissions: ['proyectos.ver'],
  teams: [],
  dataScope: 'COUNTRY',
};

function profileQuery(
  overrides: Partial<UseQueryResult<Profile, ApiError>>,
): UseQueryResult<Profile, ApiError> {
  return { data: PROFILE, isPending: false, isError: false, ...overrides } as UseQueryResult<
    Profile,
    ApiError
  >;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(new Date(2026, 9, 13, 9, 59, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroCard (PF-01.1)', () => {
  it('muestra nombre, roles, ámbito, fecha y hora, y la hora cambia sin recargar', () => {
    renderWithProviders(<HeroCard profile={profileQuery({})} optionCount={3} moduleCount={2} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Buenos días, Ana.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('asesor')).toBeInTheDocument();
    expect(screen.getByText('Ámbito: País')).toBeInTheDocument();
    expect(screen.getByText(/Martes, 13 de octubre de 2026/)).toBeInTheDocument();
    expect(screen.getByTestId('home-clock')).toHaveTextContent('09:59');
    expect(screen.getByText(/Tienes acceso a/)).toHaveTextContent(
      'Tienes acceso a 3 opciones en 2 módulos',
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('home-clock')).toHaveTextContent('10:00');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('home-clock')).toHaveTextContent('10:01');
  });

  it('mientras /me carga saluda con el nombre de la sesión y avisa de que los accesos cargan', () => {
    renderWithProviders(
      <HeroCard
        profile={profileQuery({ data: undefined, isPending: true })}
        sessionDisplayName="Luis Pérez"
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Buenos días, Luis.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Estamos cargando tus accesos.')).toBeInTheDocument();
  });

  it('sin nombre, sólo el saludo', () => {
    renderWithProviders(
      <HeroCard profile={profileQuery({ data: undefined, isPending: false, isError: true })} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Buenos días.' })).toBeInTheDocument();
  });
});
