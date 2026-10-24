import {
  buildReportCsv,
  CONSOLE_ENTRY_LIMIT,
  exitCodeOf,
  fileProblemReport,
  formatReportSummary,
  hasErrors,
  type LoadReport,
  newReport,
  type ReportEntry,
  type SheetSummary,
} from './initial-data-report';

const SHEET: SheetSummary = { sheet: 'Proyectos', read: 3, toCreate: 1, created: 0, exists: 1, existsDifferent: 0, createdWithWarning: 0, errors: 1 };

const ENTRIES: ReportEntry[] = [
  { sheet: 'Proyectos', row: 2, column: 'Nombre del proyecto', status: 'ERROR', code: 'REQUIRED_FIELD_MISSING', message: 'El campo es obligatorio.' },
  { sheet: 'Proyectos', row: 3, column: 'Código de proyecto', status: 'EXISTS', code: 'ALREADY_EXISTS', message: 'Ya existe un proyecto con ese código; no se modifica.' },
];

describe('informe de la carga inicial', () => {
  it('cuenta filas con error y errores de archivo, y decide el código de salida', () => {
    const withErrors = newReport('projects', 'validate', [SHEET], ENTRIES, false);
    expect(withErrors.errorCount).toBe(1);
    expect(hasErrors(withErrors)).toBe(true);
    expect(exitCodeOf(withErrors)).toBe(1);

    const clean = newReport('projects', 'validate', [{ ...SHEET, errors: 0 }], [ENTRIES[1]!], false);
    expect(clean.errorCount).toBe(0);
    expect(exitCodeOf(clean)).toBe(0);

    const fileLevel = fileProblemReport('projects', 'apply', [{ sheet: null, row: null, column: 'X', status: 'ERROR', code: 'UNKNOWN_COLUMN', message: 'La columna no pertenece a la plantilla.' }]);
    expect(fileLevel).toMatchObject({ errorCount: 1, applied: false, sheets: [] });
    expect(exitCodeOf(fileLevel)).toBe(1);
  });

  it('el resumen de validar dice que no se escribió nada y lista fila, columna y motivo', () => {
    const lines = formatReportSummary(newReport('projects', 'validate', [SHEET], ENTRIES, false));
    expect(lines).toEqual([
      'Carga inicial de projects - plantilla v2 - modo: validar (no se escribió nada)',
      '  Hoja Proyectos: leídas 3 - por crear 1 - ya existen 1 - con errores 1',
      '  [Error] hoja Proyectos, fila 2, columna Nombre del proyecto: El campo es obligatorio. (REQUIRED_FIELD_MISSING)',
      '  [Ya existe (omitida)] hoja Proyectos, fila 3, columna Código de proyecto: Ya existe un proyecto con ese código; no se modifica. (ALREADY_EXISTS)',
      'Resultado: CON ERRORES (1).',
    ]);
  });

  it('el resumen de aplicar sin errores muestra las creadas; con errores dice que no se aplicó nada', () => {
    const applied = formatReportSummary(newReport('projects', 'apply', [{ ...SHEET, errors: 0, created: 1 }], [], true));
    expect(applied[1]).toBe('  Hoja Proyectos: leídas 3 - por crear 1 - creadas 1 - ya existen 1 - con errores 0');
    expect(applied.at(-1)).toBe('Resultado: SIN ERRORES. Carga aplicada.');

    const aborted = formatReportSummary(newReport('projects', 'apply', [SHEET], ENTRIES, false));
    expect(aborted[0]).toContain('aplicar (no se aplicó nada)');
    expect(aborted.at(-1)).toBe('Resultado: CON ERRORES (1). No se aplicó nada: corrija el archivo y vuelva a ejecutar.');
  });

  it('una validación limpia indica cómo aplicar', () => {
    const lines = formatReportSummary(newReport('safety-minutes', 'validate', [{ ...SHEET, sheet: 'Minutos', errors: 0 }], [], false));
    expect(lines.at(-1)).toBe('Resultado: SIN ERRORES. Nada se escribió; ejecute `apply` con --actor para cargar.');
  });

  it('la consola recorta la lista de incidencias, el CSV las trae todas', () => {
    const many: ReportEntry[] = Array.from({ length: CONSOLE_ENTRY_LIMIT + 5 }, (_, index) => ({
      sheet: 'Proyectos',
      row: index + 2,
      column: 'Ciudad',
      status: 'ERROR',
      code: 'MAX_LENGTH',
      message: 'El valor supera la longitud máxima de 120 caracteres.',
    }));
    const report: LoadReport = newReport('projects', 'validate', [{ ...SHEET, errors: many.length }], many, false);
    const lines = formatReportSummary(report);
    expect(lines.filter((line) => line.startsWith('  [Error]'))).toHaveLength(CONSOLE_ENTRY_LIMIT);
    expect(lines).toContain('  ... y 5 incidencias más (todas están en el archivo de informe).');
    expect(buildReportCsv(report).trim().split('\r\n')).toHaveLength(many.length + 1);
  });

  it('las advertencias tienen categoría propia, no cuentan como error y no cambian el código de salida', () => {
    const warnings: ReportEntry[] = [
      { sheet: 'Proyectos', row: 2, column: 'Código de proyecto', status: 'WARNING', code: 'EXISTS_DIFFERENT', message: 'Ya existe con otro código.' },
      { sheet: 'Proyectos', row: 3, column: null, status: 'WARNING', code: 'CLASSIFICATION_FAILED', message: 'Creado sin clasificar.' },
    ];
    const report = newReport('projects', 'apply', [{ ...SHEET, errors: 0, created: 0, exists: 0, existsDifferent: 1, createdWithWarning: 1 }], warnings, true);
    expect(report.errorCount).toBe(0);
    expect(exitCodeOf(report)).toBe(0);
    const lines = formatReportSummary(report);
    expect(lines[1]).toBe('  Hoja Proyectos: leídas 3 - por crear 1 - creadas 0 - ya existen 0 - ya existen con datos distintos 1 - creadas con advertencia 1 - con errores 0');
    expect(lines).toContain('  [Advertencia] hoja Proyectos, fila 2, columna Código de proyecto: Ya existe con otro código. (EXISTS_DIFFERENT)');
    expect(lines).toContain('Resultado: SIN ERRORES. Carga aplicada.');
    expect(lines.at(-1)).toBe('Advertencias: 2 fila(s) requieren revisión manual (ver el informe); no cambian el código de salida.');
    expect(buildReportCsv(report)).toContain('Proyectos,2,Código de proyecto,Advertencia,EXISTS_DIFFERENT,Ya existe con otro código.');
  });

  it('el CSV lleva hoja, fila, columna, estado, código y motivo, con BOM, y neutraliza fórmulas', () => {
    const csv = buildReportCsv(
      newReport('projects', 'validate', [SHEET], [...ENTRIES, { sheet: null, row: null, column: '=CMD', status: 'ERROR', code: 'UNKNOWN_COLUMN', message: 'La columna no pertenece a la plantilla.' }], false),
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Hoja,Fila,Columna,Estado,Código,Motivo',
      'Proyectos,2,Nombre del proyecto,Error,REQUIRED_FIELD_MISSING,El campo es obligatorio.',
      'Proyectos,3,Código de proyecto,Ya existe (omitida),ALREADY_EXISTS,"Ya existe un proyecto con ese código; no se modifica."',
      ",,'=CMD,Error,UNKNOWN_COLUMN,La columna no pertenece a la plantilla.",
      '',
    ]);
  });
});
