import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detail, GT_FORM_OPTIONS, listItem, paginated } from '@/features/crm/opportunities/testing/opportunity-fixtures';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { project, READ_ONLY, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { ProjectOpportunitiesSection } from './ProjectOpportunitiesSection';

const STALE = {
  code: 'EXCHANGE_RATE_STALE',
  message: 'x',
  details: { currencyCode: 'GTQ', exchangeRateDate: '2026-08-27', referenceDate: '2026-10-11', ageDays: 45, thresholdDays: 31 },
};

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'oportunidades.ver', 'oportunidades.crear', 'oportunidades.editar']);
});
afterEach(signOut);

describe('ProjectOpportunitiesSection (F-17, AC-03.48, AC-03.90)', () => {
  it('tras crear con una tasa antigua muestra el aviso no bloqueante con la fecha de la tasa aplicada', async () => {
    mockApi({
      'GET /projects/p-1/opportunities': () => jsonResponse(paginated([listItem(), listItem({ id: 'o-2', code: 'OPO-2026-00002' })])),
      'GET /opportunities/form-options': () => jsonResponse(GT_FORM_OPTIONS),
      'POST /projects/p-1/opportunities': () => jsonResponse({ ...detail({ code: 'OPO-2026-00003' }), warnings: [STALE] }, 201),
    });
    renderWithProviders(<ProjectOpportunitiesSection project={project()} />);

    const section = await screen.findByRole('region', { name: 'Oportunidades' });
    expect(await within(section).findByText('OPO-2026-00002')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Nueva oportunidad' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva oportunidad' });
    await userEvent.type(await within(dialog).findByRole('textbox', { name: /Monto estimado/ }), '100');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear oportunidad' }));

    const notice = await within(section).findByRole('status');
    expect(notice).toHaveTextContent(/Oportunidad OPO-2026-00003 creada\. La estimación se guardó con el tipo de cambio de GTQ vigente desde el .*, 45 días antes/);
  });

  it('sin capabilities del proyecto ni de la oportunidad, no hay acciones de edición', async () => {
    mockApi({
      'GET /projects/p-1/opportunities': () =>
        jsonResponse(paginated([listItem({ capabilities: { canEdit: false, canClose: false, canReopen: false, canDelete: false } })])),
      'GET /opportunities/form-options': () => jsonResponse(GT_FORM_OPTIONS),
    });
    renderWithProviders(<ProjectOpportunitiesSection project={project({ capabilities: READ_ONLY })} />);

    expect(await screen.findByText('OPO-2026-00001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva oportunidad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar OPO-2026-00001' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalle de OPO-2026-00001' })).toBeInTheDocument();
  });
});
