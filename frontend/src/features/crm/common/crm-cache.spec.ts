import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { customerKeys } from '@/features/crm/customers/customers.queries';
import { forecastKeys } from '@/features/crm/forecast/forecast.queries';
import { opportunityKeys } from '@/features/crm/opportunities/opportunities.queries';
import { projectKeys } from '@/features/crm/projects/projects.queries';

import { CRM_CACHE_ROOTS, invalidateCrmCaches } from './crm-cache';

describe('crm-cache', () => {
  it('las raíces coinciden con las fábricas de claves de cada submódulo', () => {
    expect(CRM_CACHE_ROOTS.forecast).toEqual(forecastKeys.all);
    expect(CRM_CACHE_ROOTS.opportunities).toEqual(opportunityKeys.all);
    expect(customerKeys.projects('c-1', {}).slice(0, CRM_CACHE_ROOTS.customerProjects.length)).toEqual(CRM_CACHE_ROOTS.customerProjects);
    expect(CRM_CACHE_ROOTS.projectTeamLists).toEqual(projectKeys.teamLists());
  });

  it('invalida solo las cachés pedidas', async () => {
    const client = new QueryClient();
    const keys = {
      forecast: forecastKeys.rows({ mode: 'WINDOW' }),
      opportunities: opportunityKeys.list({}),
      customerProjects: customerKeys.projects('c-1', { page: 1 }),
      customerDetail: customerKeys.detail('c-1'),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, { ok: true });

    await invalidateCrmCaches(client, ['forecast', 'customerProjects']);

    expect(client.getQueryState(keys.forecast)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.customerProjects)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.opportunities)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.customerDetail)?.isInvalidated).toBe(false);
  });
});
