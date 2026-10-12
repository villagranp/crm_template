import { screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { ForecastPage } from '../forecast/ForecastPage';
import { OpportunitiesPage } from '../opportunities/OpportunitiesPage';
import { OpportunityDetailPage } from '../opportunities/OpportunityDetailPage';

import { ProjectCreatePage } from './ProjectCreatePage';
import { ProjectDetailPage } from './ProjectDetailPage';
import { ProjectsSearchPage } from './ProjectsSearchPage';
import { TeamProjectsPage } from './TeamProjectsPage';

/**
 * Páginas provisionales del Módulo 3 (etapa E1): título y migas definitivos y
 * el estado "En construcción", sin llamar a la API. E3 sustituye cada una.
 */
const PAGES: [
  name: string,
  Page: ComponentType,
  title: string,
  crumbs: [label: string, href: string | null][],
][] = [
  [
    'ProjectsSearchPage',
    ProjectsSearchPage,
    'Proyectos',
    [
      ['Inicio', '/'],
      ['Proyectos', null],
    ],
  ],
  [
    'ProjectCreatePage',
    ProjectCreatePage,
    'Nuevo proyecto',
    [
      ['Inicio', '/'],
      ['Proyectos', '/proyectos'],
      ['Nuevo proyecto', null],
    ],
  ],
  [
    'ProjectDetailPage',
    ProjectDetailPage,
    'Ficha del proyecto',
    [
      ['Inicio', '/'],
      ['Proyectos', '/proyectos'],
      ['Ficha', null],
    ],
  ],
  [
    'TeamProjectsPage',
    TeamProjectsPage,
    'Proyectos del equipo',
    [
      ['Inicio', '/'],
      ['Proyectos', '/proyectos'],
      ['Proyectos del equipo', null],
    ],
  ],
  [
    'OpportunitiesPage',
    OpportunitiesPage,
    'Oportunidades',
    [
      ['Inicio', '/'],
      ['Proyectos', '/proyectos'],
      ['Oportunidades', null],
    ],
  ],
  [
    'OpportunityDetailPage',
    OpportunityDetailPage,
    'Detalle de oportunidad',
    [
      ['Inicio', '/'],
      ['Proyectos', '/proyectos'],
      ['Oportunidades', '/proyectos/oportunidades'],
      ['Detalle', null],
    ],
  ],
  [
    'ForecastPage',
    ForecastPage,
    'Forecast M+6',
    [
      ['Inicio', '/'],
      ['Proyectos', '/proyectos'],
      ['Forecast M+6', null],
    ],
  ],
];

describe('páginas provisionales del Módulo 3 (03 §E.1)', () => {
  it.each(PAGES)(
    '%s muestra su título, sus migas y el estado "En construcción"',
    (_name, Page, title, crumbs) => {
      renderWithProviders(<Page />);

      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText('En construcción')).toBeInTheDocument();

      const breadcrumbs = within(screen.getByRole('navigation', { name: 'Ruta de navegación' }));
      for (const [label, href] of crumbs) {
        if (href) {
          expect(breadcrumbs.getByRole('link', { name: label })).toHaveAttribute('href', href);
        } else {
          expect(breadcrumbs.getByText(label)).toBeInTheDocument();
        }
      }
    },
  );
});
