import type { Response } from 'express';

import { EXPORT_TRUNCATED_HEADER } from '@/common/csv';
import { XLSX_CONTENT_TYPE } from '@/common/xlsx';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import type { ReportDownload } from './report-export.service';

/** Cabecera con el número de filas del archivo (F.4). */
export const EXPORT_ROWS_HEADER = 'X-Export-Rows';

/**
 * Descarga XLSX sobre la respuesta de Express (F.4): `200`, tipo OOXML, siempre como
 * adjunto con nombre fijo generado por el servidor, `X-Export-Rows`, `X-Export-Truncated:
 * false` (nunca se trunca en este módulo, RN-05.45), `no-store` y `nosniff`.
 */
export function httpReportDownload(response: Response): ReportDownload {
  return {
    open: ({ fileName, rows }) => {
      response.status(200);
      response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      response.setHeader(EXPORT_ROWS_HEADER, String(rows));
      response.setHeader(EXPORT_TRUNCATED_HEADER, 'false');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      return response;
    },
  };
}

/**
 * Ejecuta una exportación hacia `response`. Un error **antes** de empezar el archivo
 * (validación, `422 EXPORT_TOO_LARGE`, `503 REPORT_TIMEOUT`…) llega al filtro global con
 * el formato estándar. Si ya se enviaron las cabeceras, el archivo no puede convertirse en
 * un error JSON: se registra (sin datos) y se corta la conexión, para que el cliente
 * reciba una descarga fallida y nunca un archivo truncado que parezca válido.
 */
export async function streamReportExport(
  response: Response,
  logger: AppLogger,
  correlationId: string,
  work: (download: ReportDownload) => Promise<void>,
): Promise<void> {
  try {
    await work(httpReportDownload(response));
  } catch (error) {
    if (!response.headersSent) throw error;
    logger.error('report_export_aborted', { correlationId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    response.destroy();
  }
}
