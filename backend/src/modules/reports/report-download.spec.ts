import { Writable } from 'node:stream';

import type { Response } from 'express';

import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { streamReportExport } from './report-download';

/** Respuesta de Express mínima: las cabeceras "salen" con el primer byte escrito. */
class FakeResponse extends Writable {
  statusCode = 0;
  readonly headers = new Map<string, string>();
  readonly chunks: Buffer[] = [];
  private sent = false;

  get headersSent(): boolean {
    return this.sent;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  removeHeader(name: string): void {
    this.headers.delete(name.toLowerCase());
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.sent = true;
    this.chunks.push(chunk);
    callback();
  }
}

function setup(): { response: FakeResponse; logger: { error: jest.Mock }; run: (work: Parameters<typeof streamReportExport>[3]) => Promise<void> } {
  const response = new FakeResponse();
  const logger = { error: jest.fn() };
  return {
    response,
    logger,
    run: (work) => streamReportExport(response as unknown as Response, logger as unknown as AppLogger, 'corr-1', work),
  };
}

const FILE = { fileName: 'reporte-proyectos-20261014-1200.xlsx', rows: 2 };
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('streamReportExport (F.4, P-05.12)', () => {
  it('éxito: cabeceras del adjunto y el archivo completo en la respuesta', async () => {
    const { response, run } = setup();
    await run(async (download) => {
      const out = download.open(FILE);
      out.end('xlsx-bytes');
    });
    await flush();
    expect(response.statusCode).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${FILE.fileName}"`);
    expect(response.headers.get('x-export-rows')).toBe('2');
    expect(response.headers.get('x-export-truncated')).toBe('false');
    expect(Buffer.concat(response.chunks).toString()).toBe('xlsx-bytes');
  });

  it('error antes de abrir la descarga: llega al filtro global sin cabeceras de archivo', async () => {
    const { response, logger, run } = setup();
    const failure = new Error('EXPORT_TOO_LARGE');
    await expect(run(() => Promise.reject(failure))).rejects.toBe(failure);
    expect(response.headers.size).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('error con el libro empezado pero sin cabeceras enviadas: se retiran las del archivo, no se escribe nada más y el error llega al filtro', async () => {
    const { response, logger, run } = setup();
    const failure = new Error('REPORT_TIMEOUT');
    let out: NodeJS.WritableStream | null = null;
    await expect(
      run(async (download) => {
        out = download.open(FILE);
        throw failure;
      }),
    ).rejects.toBe(failure);
    // Un intento tardío de escribir el ZIP no llega a la respuesta (que responderá el JSON del error).
    (out as unknown as { write: (chunk: string) => boolean } | null)?.write('late');
    await flush();
    expect(response.headersSent).toBe(false);
    expect(response.chunks).toEqual([]);
    for (const header of ['content-type', 'content-disposition', 'x-export-rows', 'x-export-truncated']) {
      expect(response.headers.has(header)).toBe(false);
    }
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('error con las cabeceras ya enviadas: se registra sin datos y se corta la conexión (nunca un archivo truncado válido)', async () => {
    const { response, logger, run } = setup();
    await run(async (download) => {
      const out = download.open(FILE);
      out.write('part');
      await flush();
      throw new TypeError('boom');
    });
    expect(response.destroyed).toBe(true);
    expect(logger.error).toHaveBeenCalledWith('report_export_aborted', { correlationId: 'corr-1', errorName: 'TypeError' });
  });
});
