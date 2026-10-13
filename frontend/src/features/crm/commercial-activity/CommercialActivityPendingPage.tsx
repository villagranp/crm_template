import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { PendingScreen } from '@/features/crm/common/PendingScreen';

/**
 * Marcador PROVISIONAL de las rutas de Actividad comercial (04 E.1). El backend del
 * módulo ya registró sus rutas en `app-routes.registry.json` (y la semilla crea sus
 * opciones de menú, DM-32); las pantallas reales (E.2–E.10) las entrega la etapa de
 * frontend del módulo y sustituyen a este componente en `crm-routes.ts`.
 */
export function CommercialActivityPendingPage() {
  return (
    <>
      <PageHeader title="Actividad comercial" breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' })} />
      <PendingScreen description="Esta pantalla de Actividad comercial está en desarrollo." />
    </>
  );
}
