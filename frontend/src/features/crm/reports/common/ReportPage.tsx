import { Alert, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';

import { ExportButton, ExportFeedback } from './ExportButton';
import type { ReportExporter } from './use-report-export';

/**
 * Esqueleto común de las pantallas de Reportes (05 E.1): `PageHeader` con migas
 * "Inicio / Reportes / <Pantalla>", "Exportar a Excel" en las acciones (sólo con
 * `reportes.exportar`), el resultado de la exportación y el contenido en una columna.
 */
export interface ReportPageProps {
  title: string;
  subtitle?: string;
  /** Exportación de la pantalla; sin ella (dashboard, embudo) no hay botón. */
  exporter?: ReportExporter;
  /** `true` si `GET /reports/filter-options` falló: los selectores quedan sin opciones. */
  filterOptionsFailed?: boolean;
  /** Acciones extra en la cabecera, antes de "Exportar a Excel". */
  actions?: ReactNode;
  children: ReactNode;
}

export function ReportPage({ title, subtitle, exporter, filterOptionsFailed = false, actions, children }: ReportPageProps) {
  const exportButton = exporter ? <ExportButton exporter={exporter} /> : null;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={crmBreadcrumbs({ label: 'Reportes' }, { label: title })}
        actions={
          actions || exportButton ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {actions}
              {exportButton}
            </Stack>
          ) : undefined
        }
      />
      <Stack spacing={2}>
        {exporter ? <ExportFeedback exporter={exporter} /> : null}
        {filterOptionsFailed ? (
          <Alert severity="warning">No se pudieron cargar las opciones de filtro (asesores, países, catálogos). El reporte sigue disponible sin ellos.</Alert>
        ) : null}
        {children}
      </Stack>
    </>
  );
}
