import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingScreen } from '@/features/crm/common/PendingScreen';
import { ROUTE_PATHS } from '@/routes/route-paths';

/** Alta de cliente (02 §E.3, F-06). Marcador hasta que exista el contrato del backend. */
export function CustomerCreatePage() {
  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        breadcrumbs={crmBreadcrumbs({ label: 'Clientes', to: ROUTE_PATHS.crm.customers }, { label: 'Nuevo cliente' })}
      />
      <PendingScreen description="El alta de clientes está en desarrollo." />
    </>
  );
}
