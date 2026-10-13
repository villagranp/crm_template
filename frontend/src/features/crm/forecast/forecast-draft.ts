import { compareDecimals, DECIMAL_SPECS, describeDecimalIssue, multiplyDecimals, normalizeDecimal, parseDecimal } from '@/features/crm/common/decimal';
import { ApiError } from '@/services/api/api-error';

import type { ForecastCell, ForecastRow, SaveForecastLineInput } from './forecast.api';
import { FORECAST_CELL_MESSAGES, FORECAST_ERROR_CODES } from './forecast.errors';

/**
 * Borrador de la matriz del forecast (03 §E.8, F-20, D-03.6). Funciones puras:
 * la matriz guarda aquí lo que el usuario cambia y solo envía eso.
 *
 * - Cada celda editada recuerda la cantidad y el `updatedAt` que vio al empezar
 *   (`expectedUpdatedAt`): si otro usuario la cambió, el backend rechaza el lote
 *   con `409 FORECAST_LINE_STALE` (concurrencia optimista).
 * - Volver al valor guardado quita la celda del borrador.
 * - Cambiar la unidad de una fila se aplica a todas sus celdas editables con
 *   línea (se reenvían con su cantidad y la unidad nueva) y a las nuevas.
 * - La vista previa del tonelaje usa el `conversion.factor` que devuelve el
 *   backend para la unidad de la fila, nunca un factor propio.
 *
 * El borrador se indexa por (proyecto, producto, año, mes), así que sobrevive a
 * cambios de página o de filtros.
 */

export interface CellRef {
  projectId: string;
  productId: string;
  year: number;
  month: number;
}

export interface DraftCell extends CellRef {
  /** Cadena canónica si es válida; si no, el texto tal cual. `''` = vacío. */
  value: string;
  /** Cantidad guardada (canónica) cuando se empezó a editar; `null` si la celda estaba vacía. */
  original: string | null;
  /** `updatedAt` de la línea vista al empezar a editar. */
  expectedUpdatedAt: string | null;
}

export interface DraftRowUnit {
  projectId: string;
  productId: string;
  unitId: string;
  /** Celdas editables con línea que se reenvían con la unidad nueva. */
  lines: { ref: CellRef; quantity: string; expectedUpdatedAt: string | null }[];
}

export interface ForecastDraft {
  cells: Readonly<Record<string, DraftCell>>;
  units: Readonly<Record<string, DraftRowUnit>>;
}

export const EMPTY_DRAFT: ForecastDraft = { cells: {}, units: {} };

const NOT_EMPTY_FOR_LINE = 'Escribe 0 para quitar la proyección.';

export function cellKey({ projectId, productId, year, month }: CellRef): string {
  return `${projectId}|${productId}|${year}-${String(month).padStart(2, '0')}`;
}

export function rowKey(projectId: string, productId: string): string {
  return `${projectId}|${productId}`;
}

export function refOf(row: Pick<ForecastRow, 'project' | 'product'>, cell: Pick<ForecastCell, 'year' | 'month'>): CellRef {
  return { projectId: row.project.id, productId: row.product.id, year: cell.year, month: cell.month };
}

function canonicalOf(value: string): string | null {
  const parsed = parseDecimal(value, DECIMAL_SPECS.quantity);
  return parsed.ok ? parsed.value : null;
}

function sameQuantity(value: string, original: string | null): boolean {
  if (original === null) {
    return value.trim() === '';
  }
  const canonical = canonicalOf(value);
  return canonical !== null && compareDecimals(canonical, original) === 0;
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** Escribe en una celda. Si vuelve al valor guardado, la celda sale del borrador. */
export function editCell(draft: ForecastDraft, row: Pick<ForecastRow, 'project' | 'product'>, cell: ForecastCell, value: string): ForecastDraft {
  const ref = refOf(row, cell);
  const key = cellKey(ref);
  const previous = draft.cells[key];
  const original = previous ? previous.original : cell.quantity !== null ? normalizeDecimal(cell.quantity) : null;
  const expectedUpdatedAt = previous ? previous.expectedUpdatedAt : cell.updatedAt;
  if (sameQuantity(value, original)) {
    return previous ? { ...draft, cells: without(draft.cells, key) } : draft;
  }
  return { ...draft, cells: { ...draft.cells, [key]: { ...ref, value, original, expectedUpdatedAt } } };
}

/** Escape: la celda vuelve a lo guardado. */
export function revertCell(draft: ForecastDraft, key: string): ForecastDraft {
  return draft.cells[key] ? { ...draft, cells: without(draft.cells, key) } : draft;
}

/** Valor en borrador de una celda (o `undefined` si no está en el borrador). */
export function draftValue(draft: ForecastDraft, key: string): string | undefined {
  return draft.cells[key]?.value;
}

/** Unidad elegida para una fila en el borrador (o `undefined`). */
export function draftUnit(draft: ForecastDraft, projectId: string, productId: string): string | undefined {
  return draft.units[rowKey(projectId, productId)]?.unitId;
}

/** Cambia la unidad de la fila (03 §E.8): elegir la propuesta deshace el cambio. */
export function setRowUnit(draft: ForecastDraft, row: ForecastRow, unitId: string): ForecastDraft {
  const key = rowKey(row.project.id, row.product.id);
  const lines = row.cells
    .filter((cell) => cell.editable && cell.lineId !== null && cell.quantity !== null && cell.unit?.id !== unitId)
    .map((cell) => ({ ref: refOf(row, cell), quantity: normalizeDecimal(cell.quantity ?? '0'), expectedUpdatedAt: cell.updatedAt }));
  if (unitId === row.unit.id && lines.length === 0) {
    return draft.units[key] ? { ...draft, units: without(draft.units, key) } : draft;
  }
  return { ...draft, units: { ...draft.units, [key]: { projectId: row.project.id, productId: row.product.id, unitId, lines } } };
}

/** Validación local de una celda (≥ 0, numérica, 4 decimales). `hadLine`: vaciar una línea no la borra. */
export function cellIssue(cell: Pick<DraftCell, 'value' | 'original'>): string | null {
  if (cell.value.trim() === '') {
    return cell.original === null ? null : NOT_EMPTY_FOR_LINE;
  }
  const parsed = parseDecimal(cell.value, DECIMAL_SPECS.quantity);
  return parsed.ok ? null : describeDecimalIssue(parsed.issue, DECIMAL_SPECS.quantity);
}

/** Incidencias locales del borrador por celda. */
export function draftIssues(draft: ForecastDraft): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const [key, cell] of Object.entries(draft.cells)) {
    const issue = cellIssue(cell);
    if (issue) issues[key] = issue;
  }
  return issues;
}

export interface SavePayload {
  lines: SaveForecastLineInput[];
  /** `keys[i]` = celda de `lines[i]` (para pintar los errores `lines[i]` en su celda). */
  keys: string[];
}

/**
 * Cuerpo de `PUT /forecast/lines` con solo las celdas cambiadas, su
 * `expectedUpdatedAt` y, si la fila cambió de unidad, la unidad nueva. Las
 * celdas con incidencias locales no se envían (hay que corregirlas antes).
 */
export function buildSavePayload(draft: ForecastDraft): SavePayload {
  const entries = new Map<string, SaveForecastLineInput>();
  for (const [key, cell] of Object.entries(draft.cells)) {
    const quantity = canonicalOf(cell.value);
    if (quantity === null) continue;
    const line: SaveForecastLineInput = { projectId: cell.projectId, productId: cell.productId, year: cell.year, month: cell.month, quantity };
    if (cell.expectedUpdatedAt) line.expectedUpdatedAt = cell.expectedUpdatedAt;
    const unitId = draftUnit(draft, cell.projectId, cell.productId);
    if (unitId) line.unitId = unitId;
    entries.set(key, line);
  }
  for (const unit of Object.values(draft.units)) {
    for (const existing of unit.lines) {
      const key = cellKey(existing.ref);
      if (entries.has(key) || draft.cells[key]) continue;
      const line: SaveForecastLineInput = { ...existing.ref, quantity: existing.quantity, unitId: unit.unitId };
      if (existing.expectedUpdatedAt) line.expectedUpdatedAt = existing.expectedUpdatedAt;
      entries.set(key, line);
    }
  }
  const keys = [...entries.keys()].sort();
  return { keys, lines: keys.map((key) => entries.get(key) as SaveForecastLineInput) };
}

/** Número de líneas que se enviarían ("Guardar cambios (n)"). */
export function changeCount(draft: ForecastDraft): number {
  return buildSavePayload(draft).lines.length + Object.keys(draftIssues(draft)).length;
}

/**
 * Hay algo que guardar (o que corregir). Cambiar solo la unidad de una fila sin
 * líneas guardadas no cuenta: no hay ninguna línea que reenviar y el backend no
 * guarda unidades por fila; la elección se conserva para las celdas que se
 * escriban después, pero no bloquea la navegación ni muestra la barra de guardado.
 */
export function isDirty(draft: ForecastDraft): boolean {
  return Object.keys(draft.cells).length > 0 || Object.values(draft.units).some((unit) => unit.lines.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const LINE_FIELD = /^lines(?:\[(\d+)\]|\.(\d+))/;

function lineIndex(detail: Record<string, unknown>): number | null {
  if (typeof detail.index === 'number') {
    return detail.index;
  }
  if (typeof detail.field === 'string') {
    const match = LINE_FIELD.exec(detail.field);
    const raw = match?.[1] ?? match?.[2];
    return raw === undefined ? null : Number.parseInt(raw, 10);
  }
  return null;
}

/** Errores `lines[i]` de un `400`/`422` pintados en su celda (AC-03.71). */
export function lineErrorsByCell(error: unknown, keys: readonly string[]): Record<string, string> {
  if (!(error instanceof ApiError) || error.code === FORECAST_ERROR_CODES.lineStale) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const detail of error.details) {
    if (!isRecord(detail)) continue;
    const index = lineIndex(detail);
    const key = index === null ? undefined : keys[index];
    if (!key || result[key]) continue;
    const code = typeof detail.code === 'string' ? detail.code : error.code;
    result[key] = FORECAST_CELL_MESSAGES[code] ?? 'El valor no es válido.';
  }
  return result;
}

/** Celdas en conflicto de un `409 FORECAST_LINE_STALE` (`details[].index`). */
export function staleKeys(error: unknown, keys: readonly string[]): string[] {
  if (!(error instanceof ApiError) || error.code !== FORECAST_ERROR_CODES.lineStale) {
    return [];
  }
  return error.details.flatMap((detail) => {
    if (!isRecord(detail)) return [];
    const index = lineIndex(detail);
    const key = index === null ? undefined : keys[index];
    return key ? [key] : [];
  });
}

/**
 * "Recargar conservando el resto del borrador" tras un `409`: las celdas en
 * conflicto toman el valor del otro usuario (salen del borrador); el resto se
 * conserva con su `expectedUpdatedAt`.
 */
export function discardCells(draft: ForecastDraft, keys: readonly string[]): ForecastDraft {
  const drop = new Set(keys);
  const cells = Object.fromEntries(Object.entries(draft.cells).filter(([key]) => !drop.has(key)));
  const units = Object.fromEntries(
    Object.entries(draft.units).map(([key, unit]) => [key, { ...unit, lines: unit.lines.filter((line) => !drop.has(cellKey(line.ref))) }]),
  );
  return { cells, units };
}

/**
 * Vista previa del tonelaje de una celda con el factor del backend para la
 * unidad de la fila (`conversion.factor`). `null` si no hay regla, si la fila
 * cambió de unidad en el borrador o si la línea guardada está en otra unidad.
 */
export function previewTonnage(value: string, row: ForecastRow, cell: ForecastCell, draft: ForecastDraft): string | null {
  if (!row.conversion || draftUnit(draft, row.project.id, row.product.id)) {
    return null;
  }
  if (cell.unit && cell.unit.id !== row.unit.id) {
    return null;
  }
  const quantity = canonicalOf(value);
  return quantity === null ? null : multiplyDecimals(quantity, row.conversion.factor, 4);
}
