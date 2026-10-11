import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingScreen } from '@/features/crm/common/PendingScreen';
import { ROUTE_PATHS } from '@/routes/route-paths';

/** Ficha del cliente (02 §E.4, F-07 a F-09). Marcador hasta que exista el contrato del backend. */
export function CustomerDetailPage() {
  return (
    <>
      <PageHeader
        title="Ficha del cliente"
        breadcrumbs={crmBreadcrumbs({ label: 'Clientes', to: ROUTE_PATHS.crm.customers }, { label: 'Ficha' })}
      />
      <PendingScreen description="La ficha del cliente está en desarrollo." />
    </>
  );
}
