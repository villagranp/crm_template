import { Box, Card, Tab, Tabs } from '@mui/material';
import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs } from '@/features/admin/common';
import { usePermission } from '@/hooks/use-permission';

import { FamiliesTab } from './components/FamiliesTab';
import { ProductsTab } from './components/ProductsTab';
import { UnitsTab } from './components/UnitsTab';
import { PRODUCT_PERMISSIONS } from './products.permissions';

const TITLE = 'Productos y unidades';
const TAB_PARAM = 'tab';
const TABS = [
  { value: 'familias', label: 'Familias' },
  { value: 'productos', label: 'Productos' },
  { value: 'unidades', label: 'Unidades' },
] as const;
type TabValue = (typeof TABS)[number]['value'];
const DEFAULT_TAB: TabValue = 'productos';

function isTab(value: string | null): value is TabValue {
  return TABS.some((tab) => tab.value === value);
}

/**
 * Pantalla «Productos y unidades» (07 E.5, D-07.9): pestañas Familias, Productos
 * y Unidades, con alta, edición y activar/desactivar; sin borrado. La ruta exige
 * `productos.ver` (`admin-routes.ts`); las acciones, `productos.configurar`.
 * La pestaña activa vive en la URL (`?tab=`), igual que los filtros de cada lista.
 */
export function ProductsPage() {
  const baseId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const canConfigure = usePermission(PRODUCT_PERMISSIONS.configure);
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
          aria-label="Maestros comerciales"
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
        {active === 'familias' ? <FamiliesTab canConfigure={canConfigure} /> : null}
        {active === 'productos' ? <ProductsTab canConfigure={canConfigure} /> : null}
        {active === 'unidades' ? <UnitsTab canConfigure={canConfigure} /> : null}
      </Box>
    </>
  );
}
