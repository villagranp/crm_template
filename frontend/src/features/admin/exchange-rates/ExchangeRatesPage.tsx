import { Box, Card, Tab, Tabs } from '@mui/material';
import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs } from '@/features/admin/common';
import { usePermission } from '@/hooks/use-permission';

import { CurrenciesTab } from './components/CurrenciesTab';
import { ExchangeRatesTab } from './components/ExchangeRatesTab';
import { EXCHANGE_RATE_PERMISSIONS } from './exchange-rates.permissions';
import { useCurrencies } from './exchange-rates.queries';

const TITLE = 'Tipos de cambio';
const TAB_PARAM = 'tab';
const TABS = [
  { value: 'tasas', label: 'Tipos de cambio' },
  { value: 'monedas', label: 'Monedas' },
] as const;
type TabValue = (typeof TABS)[number]['value'];
const DEFAULT_TAB: TabValue = 'tasas';

function isTab(value: string | null): value is TabValue {
  return TABS.some((tab) => tab.value === value);
}

/**
 * Pantalla «Tipos de cambio» (07 E.5, F-46, DM-36, ADR-024). La ruta exige
 * `parametros.ver` (`admin-routes.ts`); registrar y corregir, `parametros.configurar`.
 * La pestaña activa y los filtros viven en la URL.
 */
export function ExchangeRatesPage() {
  const baseId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const canConfigure = usePermission(EXCHANGE_RATE_PERMISSIONS.configure);
  const currencies = useCurrencies();
  const raw = searchParams.get(TAB_PARAM);
  const active: TabValue = isTab(raw) ? raw : DEFAULT_TAB;

  const changeTab = (value: TabValue) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(TAB_PARAM, value);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />
      <Card sx={{ mb: 2 }}>
        <Tabs
          value={active}
          onChange={(_, value: TabValue) => changeTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Tipos de cambio y monedas"
        >
          {TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={tab.label}
              id={`${baseId}-tab-${tab.value}`}
              aria-controls={`${baseId}-panel-${tab.value}`}
            />
          ))}
        </Tabs>
      </Card>
      <Box
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
      >
        {active === 'tasas' ? (
          <ExchangeRatesTab currencies={currencies} canConfigure={canConfigure} />
        ) : null}
        {active === 'monedas' ? <CurrenciesTab currencies={currencies} /> : null}
      </Box>
    </>
  );
}
