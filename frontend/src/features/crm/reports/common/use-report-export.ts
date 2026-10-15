import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { usePermission } from '@/hooks/use-permission';
import { saveFile } from '@/lib/save-file';
import type { DownloadedFile } from '@/services/api';

import { reportErrorMessage } from '../reports.errors';
import { REPORT_PERMISSIONS } from '../reports.permissions';

/** Cabecera con las filas del archivo (05 F.4). */
export const EXPORT_ROWS_HEADER = 'X-Export-Rows';

/** Las exportaciones grandes pueden tardar (hasta 60 s de consulta, P-05.12): más margen que una llamada JSON. */
export const EXPORT_TIMEOUT_MS = 120_000;

export interface UseReportExportOptions {
  /** Descarga del archivo (`httpClient.download` sobre `/reports/<reporte>/export`). */
  request: () => Promise<DownloadedFile>;
  /** Nombre si el servidor no envía `Content-Disposition` (no debería pasar). */
  fallbackFileName: string;
}

export interface ExportResult {
  fileName: string;
  rows: number | null;
}

export interface ReportExporter {
  canExport: boolean;
  isExporting: boolean;
  start: () => void;
  result: ExportResult | null;
  errorMessage: string | null;
  dismiss: () => void;
}

export function useReportExport({ request, fallbackFileName }: UseReportExportOptions): ReportExporter {
  const canExport = usePermission(REPORT_PERMISSIONS.export);
  const [dismissed, setDismissed] = useState(false);
  const mutation = useMutation({
    mutationFn: async (): Promise<ExportResult> => {
      const file = await request();
      const fileName = file.fileName ?? fallbackFileName;
      saveFile(file.blob, fileName);
      const rows = file.headers.get(EXPORT_ROWS_HEADER)?.trim() ?? '';
      return { fileName, rows: /^\d+$/.test(rows) ? Number(rows) : null };
    },
  });

  return {
    canExport,
    isExporting: mutation.isPending,
    start: () => {
      setDismissed(false);
      mutation.mutate();
    },
    result: dismissed ? null : (mutation.data ?? null),
    errorMessage: dismissed || !mutation.isError ? null : reportErrorMessage(mutation.error),
    dismiss: () => setDismissed(true),
  };
}

