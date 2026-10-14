import { PendingPage } from '../common/PendingPage';
import { crmBreadcrumbs } from '../common/crm-breadcrumbs';

/**
 * Marcador provisional de las siete pantallas de Reportes (05 E.1) mientras se construye su
 * frontend: deja la ruta, el permiso y la opción de menú operativos sin llevar a un 404.
 */
export function ReportsPendingPage() {
  return (
    <PendingPage
      title="Reportes"
      breadcrumbs={crmBreadcrumbs({ label: 'Reportes' })}
      description="Esta pantalla de reportes está en desarrollo. El servicio de datos ya está disponible."
    />
  );
}
