import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Alert, Button, CircularProgress } from '@mui/material';

import { formatCount } from './report-format';
import type { ReportExporter } from './use-report-export';

/**
 * Exportación a Excel de un reporte (05 F-39, E.1). El archivo lo genera el backend con
 * `exceljs` (ADR-022) con los **mismos filtros y orden** que la pantalla y sin paginar
 * (`exportQuery` de `useReportQueryState`); aquí se descarga con `httpClient.download` (el
 * token vive en memoria: nunca un `<a href>` a la API) y se entrega con `saveFile`.
 *
 * - El botón sólo se muestra con `reportes.exportar` (AC-05.28); el backend lo vuelve a exigir.
 * - Muestra progreso mientras el servidor genera el archivo.
 * - `422 EXPORT_TOO_LARGE`: "El resultado tiene N filas y el máximo exportable es M. Acota los
 *   filtros."; `429`: espera de `Retry-After`; `503 REPORT_TIMEOUT`: "Acota los filtros". Todo
 *   con la referencia (`correlationId`).
 *
 * Uso: `const exporter = useReportExport({ request, fallbackFileName })`, el botón en las
 * acciones del `PageHeader` y `<ExportFeedback exporter={exporter} />` sobre el contenido.
 */

export interface ExportButtonProps {
  exporter: ReportExporter;
  label?: string;
}

/** Botón "Exportar a Excel"; no se pinta sin `reportes.exportar`. */
export function ExportButton({ exporter, label = 'Exportar a Excel' }: ExportButtonProps) {
  if (!exporter.canExport) {
    return null;
  }
  return (
    <Button
      variant="outlined"
      onClick={exporter.start}
      disabled={exporter.isExporting}
      aria-busy={exporter.isExporting}
      startIcon={exporter.isExporting ? <CircularProgress size="1em" color="inherit" aria-hidden /> : <FileDownloadOutlinedIcon />}
    >
      {exporter.isExporting ? 'Generando archivo…' : label}
    </Button>
  );
}

/** Resultado de la última exportación: archivo y filas, o el error con su referencia. */
export function ExportFeedback({ exporter }: { exporter: ReportExporter }) {
  if (!exporter.canExport) {
    return null;
  }
  if (exporter.errorMessage) {
    return (
      <Alert severity="error" role="alert" onClose={exporter.dismiss}>
        {`No se pudo exportar. ${exporter.errorMessage}`}
      </Alert>
    );
  }
  if (exporter.result) {
    const rows = exporter.result.rows === null ? '' : ` con ${formatCount(exporter.result.rows)} ${exporter.result.rows === 1 ? 'fila' : 'filas'}`;
    return (
      <Alert severity="success" role="status" onClose={exporter.dismiss}>
        {`Se descargó ${exporter.result.fileName}${rows}.`}
      </Alert>
    );
  }
  return null;
}
