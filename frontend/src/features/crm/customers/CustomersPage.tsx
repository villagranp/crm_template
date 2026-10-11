import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingScreen } from '@/features/crm/common/PendingScreen';

/** Búsqueda de clientes (02 §E.2, F-05). Marcador hasta que exista el contrato del backend. */
export function CustomersPage() {
  return (
    <>
      <PageHeader title="Clientes" breadcrumbs={crmBreadcrumbs({ label: 'Clientes' })} />
      <PendingScreen description="La búsqueda de clientes está en desarrollo." />
    </>
  );
}
