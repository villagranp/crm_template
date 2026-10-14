import { PassThrough } from 'node:stream';

import type { Response } from 'express';

import { EXPORT_TRUNCATED_HEADER } from '@/common/csv';
import { XLSX_CONTENT_TYPE } from '@/common/xlsx';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import type { ReportDownload } from './report-export.service';

/** Cabecera con el número de filas del archivo (F.4). */
export const EXPORT_ROWS_HEADER = 'X-Export-Rows';

/** Cabeceras propias del archivo: se retiran si la exportación falla antes de enviarlas. */
const FILE_HEADERS = ['Content-Type', 'Content-Disposition', EXPORT_ROWS_HEADER, EXPORT_TRUNCATED_HEADER] as const;

/**
 * Fija las cabeceras de la descarga XLSX (F.4): `200`, tipo OOXML, siempre como adjunto
 * con nombre fijo generado por el servidor, `X-Export-Rows`, `X-Export-Truncated: false`
 * (nunca se trunca en este módulo, RN-05.45), `no-store` y `nosniff`.
 */
function setDownloadHeaders(response: Response, file: { readonly fileName: string; readonly rows: number }): void {
  response.status(200);
  response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  response.setHeader(EXPORT_ROWS_HEADER, String(file.rows));
  response.setHeader(EXPORT_TRUNCATED_HEADER, 'false');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * Ejecuta una exportación hacia `response`. El archivo se escribe en un flujo intermedio
 * conectado a la respuesta, para poder desconectarlo si algo falla:
 *
 * - Error **antes** de que salgan las cabeceras (validación, `422 EXPORT_TOO_LARGE`,
 *   `503 REPORT_TIMEOUT`, aunque el libro ya se hubiera empezado en memoria): se desconecta
 *   el flujo, se retiran las cabeceras del archivo y el error llega al filtro global con el
 *   formato estándar (nunca un JSON servido como `.xlsx` adjunto ni escrituras tardías).
 * - Error **después** de enviar las cabeceras: el archivo no puede convertirse en un error
 *   JSON; se registra (sin datos) y se corta la conexión, para que el cliente reciba una
 *   descarga fallida y nunca un archivo truncado que parezca válido.
 */
export async function streamReportExport(
  response: Response,
  logger: AppLogger,
  correlationId: string,
  work: (download: ReportDownload) => Promise<void>,
): Promise<void> {
  let body: PassThrough | null = null;
  const download: ReportDownload = {
    open: (file) => {
      setDownloadHeaders(response, file);
      const stream = new PassThrough();
      stream.pipe(response);
      body = stream;
      return stream;
    },
  };
  try {
    await work(download);
  } catch (error) {
    const opened = body as PassThrough | null;
    if (opened) {
      opened.unpipe(response);
      opened.destroy();
    }
    if (!response.headersSent) {
      for (const header of FILE_HEADERS) response.removeHeader(header);
      throw error;
    }
    logger.error('report_export_aborted', { correlationId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    response.destroy();
  }
}
