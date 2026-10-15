import { PassThrough } from 'node:stream';

// Solo la prueba lee el archivo con la librería (ADR-022).
import { Workbook } from 'exceljs';

import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { ActivityReportService } from './activity-report.service';
import type { FilterOptionsService, ReportFilterOptions } from './filter-options.service';
import type { ForecastReportService } from './forecast-report.service';
import type { OpportunityReportService } from './opportunity-report.service';
import type { ProjectReportRecord, ReportExportSink } from './ports/reporting.repository.port';
import { type ReportDownload, ReportExportService } from './report-export.service';
import { fakeMetrics, fakeReporting, REPORT_CONTEXT } from './testing/report-fixtures';
import type { VisitReportService } from './visit-report.service';

function project(id: string, code: string, name: string): ProjectReportRecord {
  return {
    id,
    code,
    name,
    customer: { id: 'c1', name: '=HYPERLINK("http://x","y")' },
    country: { id: 'gt', name: 'Guatemala' },
    city: null,
    owner: { id: 'user-1', displayName: 'Ana' },
    projectType: null,
    phase: { id: 'phase-design', label: 'Diseño' },
    phaseProgress: '45.00',
    commercial: { leadingOpenStage: null, opportunityCount: 0, hasWon: false },
    estimatedDecisionDate: '2026-11-30',
    lastActivityAt: new Date('2026-10-01T18:15:00Z'),
  };
}

const OPTIONS: ReportFilterOptions = {
  owners: [{ id: 'user-1', displayName: 'Ana' }],
  countries: [{ id: 'gt', name: 'Guatemala' }],
  catalogs: { opportunityStages: [], projectPhases: [], projectTypes: [], visitStatuses: [], activityStatuses: [], activityTypes: [], priorities: [], companyTypes: [] },
  productFamilies: [],
  scope: 'OWN',
  businessTimeZone: 'America/Guatemala',
  timeZone: 'America/Guatemala',
};

function setup(rows: ProjectReportRecord[], maxRows: number) {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  const download = { open: jest.fn(() => output) } satisfies ReportDownload;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const logger = { info: jest.fn() };
  const reporting = fakeReporting({
    exportProjectRows: jest.fn(async (_criteria: unknown, _sort: unknown, sink: ReportExportSink<ProjectReportRecord>) => {
      await sink.begin(rows.length);
      await sink.write(rows);
      return rows.length;
    }),
  });
  const service = new ReportExportService(
    fakeMetrics({ countProjects: jest.fn().mockResolvedValue({ total: rows.length, active: rows.length, finished: 0 }) }),
    reporting,
    { get: jest.fn((key: string) => Promise.resolve(key === 'crm.reportes.max_filas_exportacion' ? maxRows : 6)) } as unknown as ParameterReader,
    audit as unknown as AuditService,
    logger as unknown as AppLogger,
    {} as CurrencyConversionService,
    { get: jest.fn().mockResolvedValue(OPTIONS) } as unknown as FilterOptionsService,
    {} as OpportunityReportService,
    {} as ForecastReportService,
    {} as VisitReportService,
    {} as ActivityReportService,
  );
  return { service, download, audit, logger, reporting, output, chunks };
}

describe('ReportExportService (F-39)', () => {
  it('cuenta, abre la descarga con el nombre y las filas, vuelca en orden, audita y cierra el archivo', async () => {
    const { service, download, audit, logger, reporting, chunks } = setup([project('p1', 'PRY-1', 'Torre'), project('p2', 'PRY-2', 'Bodega')], 2);

    await service.exportProjects(REPORT_CONTEXT, { ownerId: ['user-1'], sortBy: 'code' }, download);

    expect(download.open).toHaveBeenCalledWith({ fileName: 'reporte-proyectos-20261013-1200.xlsx', rows: 2 });
    expect(reporting.exportProjectRows).toHaveBeenCalledWith(expect.objectContaining({ ownerIds: ['user-1'] }), { sortBy: 'code', sortOrder: 'asc' }, expect.anything());
    expect(audit.record).toHaveBeenCalledWith('crm.report.exported', REPORT_CONTEXT.audit, {
      resourceType: 'crm.report',
      resourceId: 'projects',
      metadata: {
        report: 'projects',
        format: 'xlsx',
        filters: JSON.stringify({ ownerId: ['user-1'], sortBy: 'code', sortOrder: 'asc' }),
        scope: 'OWN',
        rows: 2,
        durationMs: expect.any(Number),
      },
    });
    // El log no lleva datos del archivo ni del usuario.
    expect(logger.info).toHaveBeenCalledWith('report_exported', { correlationId: 'corr-1', report: 'projects', format: 'xlsx', scope: 'OWN', rows: 2, durationMs: expect.any(Number) });

    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Datos', 'Resumen', 'Filtros']);
    const data = workbook.getWorksheet('Datos');
    expect(data?.getRow(2).getCell(1).value).toBe('PRY-1');
    expect(data?.getRow(3).getCell(1).value).toBe('PRY-2');
    expect(data?.getRow(2).getCell(3).value).toBe(`'=HYPERLINK("http://x","y")`);
    expect(data?.getRow(2).getCell(9).value).toBe(0.45);
    const filters = workbook.getWorksheet('Filtros');
    const described = Object.fromEntries((filters?.getSheetValues() ?? []).slice(2).map((row) => [(row as unknown[])[1], (row as unknown[])[2]]));
    expect(described).toMatchObject({ Reporte: 'Reporte de proyectos', Alcance: 'Propios', Filas: 2, Asesor: 'Ana', 'Ordenar por': 'Código', 'Sentido del orden': 'Ascendente' });
  });

  it('hoja "Filtros" legible: enumerados en español y nunca el nombre de un id fuera de las opciones autorizadas (RN-05.48, RN-05.4)', async () => {
    const { service, download, chunks } = setup([], 5);

    await service.exportProjects(
      REPORT_CONTEXT,
      { ownerId: ['user-1', 'user-9'], customerId: ['c1'], situation: 'ACTIVE', commercialStatus: ['NO_OPPORTUNITIES'], from: '2026-01-01', to: '2026-03-31', dateBasis: 'CREATED' },
      download,
    );

    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
    const filters = workbook.getWorksheet('Filtros');
    const described = Object.fromEntries((filters?.getSheetValues() ?? []).slice(2).map((row) => [(row as unknown[])[1], (row as unknown[])[2]]));
    expect(described).toMatchObject({
      // `user-9` no está entre los asesores autorizados: se muestra su id, no su nombre.
      Asesor: 'Ana, user-9',
      Cliente: 'c1',
      Situación: 'Activos',
      'Estado comercial': 'Sin oportunidades',
      'Base de fecha': 'Fecha de creación',
      'Ordenar por': 'Última actualización',
      'Sentido del orden': 'Descendente',
    });
  });

  it('por encima del tope: 422 EXPORT_TOO_LARGE con filas y tope, sin abrir la descarga ni auditar (RN-05.45)', async () => {
    const { service, download, audit } = setup([project('p1', 'PRY-1', 'A'), project('p2', 'PRY-2', 'B'), project('p3', 'PRY-3', 'C')], 2);
    await expect(service.exportProjects(REPORT_CONTEXT, {}, download)).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE', details: [{ rows: 3, maxRows: 2 }] });
    expect(download.open).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
