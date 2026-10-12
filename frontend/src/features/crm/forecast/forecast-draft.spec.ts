import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/api-error';

import {
  buildSavePayload,
  cellKey,
  changeCount,
  discardCells,
  draftIssues,
  editCell,
  EMPTY_DRAFT,
  isDirty,
  lineErrorsByCell,
  previewTonnage,
  revertCell,
  setRowUnit,
  staleKeys,
} from './forecast-draft';
import type { ForecastCell } from './forecast.api';
import { KG, row, savedCell, VAR } from './testing/forecast-fixtures';

const ROW = row();
const [SAVED, EMPTY_FEB, EMPTY_MAR] = ROW.cells as [ForecastCell, ForecastCell, ForecastCell];
const KEY_JAN = cellKey({ projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 1 });
const KEY_FEB = cellKey({ projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 2 });
const KEY_MAR = cellKey({ projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 3 });

function apiError(statusCode: number, code: string, details: unknown[]): ApiError {
  return new ApiError({ statusCode, code, message: 'x', details, correlationId: 'c' });
}

describe('forecast-draft (03 §E.8, PF-03.101)', () => {
  it('editar marca la celda con lo que vio el usuario; volver al valor guardado la saca del borrador', () => {
    let draft = editCell(EMPTY_DRAFT, ROW, SAVED, '150');
    expect(draft.cells[KEY_JAN]).toEqual({
      projectId: 'p-1',
      productId: 'pr-var3',
      year: 2027,
      month: 1,
      value: '150',
      original: '120',
      expectedUpdatedAt: '2026-12-01T15:00:00.000Z',
    });
    expect(isDirty(draft)).toBe(true);
    draft = editCell(draft, ROW, SAVED, '120.00');
    expect(draft.cells[KEY_JAN]).toBeUndefined();
    expect(isDirty(draft)).toBe(false);

    // Una celda vacía que se deja vacía no es un cambio.
    expect(editCell(EMPTY_DRAFT, ROW, EMPTY_FEB, '')).toBe(EMPTY_DRAFT);
  });

  it('conserva el expectedUpdatedAt de la primera edición aunque la fila se recargue (concurrencia optimista, D-03.6)', () => {
    const first = editCell(EMPTY_DRAFT, ROW, SAVED, '150');
    const reloaded = savedCell(1, '130.0000', { updatedAt: '2026-12-05T10:00:00.000Z' });
    const second = editCell(first, ROW, reloaded, '160');
    expect(second.cells[KEY_JAN]?.expectedUpdatedAt).toBe('2026-12-01T15:00:00.000Z');
    expect(second.cells[KEY_JAN]?.original).toBe('120');
  });

  it('valida en local (≥ 0, numérica, 4 decimales) y vaciar una línea guardada pide 0', () => {
    let draft = editCell(EMPTY_DRAFT, ROW, EMPTY_FEB, '-5');
    draft = editCell(draft, ROW, EMPTY_MAR, '1.23456');
    draft = editCell(draft, ROW, SAVED, '');
    expect(draftIssues(draft)).toEqual({
      [KEY_FEB]: 'Debe ser mayor o igual que 0.',
      [KEY_MAR]: 'Admite como máximo 4 decimales.',
      [KEY_JAN]: 'Escribe 0 para quitar la proyección.',
    });
    expect(buildSavePayload(draft).lines).toEqual([]);
    expect(changeCount(draft)).toBe(3);
  });

  it('el lote lleva solo las celdas cambiadas, con su expectedUpdatedAt; 0 conserva la línea (RN-03.65)', () => {
    let draft = editCell(EMPTY_DRAFT, ROW, SAVED, '0');
    draft = editCell(draft, ROW, EMPTY_FEB, '1,200.5');
    const payload = buildSavePayload(draft);
    expect(payload.keys).toEqual([KEY_JAN, KEY_FEB]);
    expect(payload.lines).toEqual([
      { projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 1, quantity: '0', expectedUpdatedAt: '2026-12-01T15:00:00.000Z' },
      { projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 2, quantity: '1200.5' },
    ]);
    expect(revertCell(draft, KEY_JAN).cells[KEY_JAN]).toBeUndefined();
  });

  it('cambiar la unidad de la fila reenvía las líneas editables con su cantidad y la unidad nueva', () => {
    let draft = setRowUnit(EMPTY_DRAFT, ROW, KG.id);
    draft = editCell(draft, ROW, EMPTY_FEB, '10');
    expect(buildSavePayload(draft).lines).toEqual([
      { projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 1, quantity: '120', unitId: KG.id, expectedUpdatedAt: '2026-12-01T15:00:00.000Z' },
      { projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 2, quantity: '10', unitId: KG.id },
    ]);
    // Volver a la unidad propuesta (sin líneas en otra unidad) deshace el cambio.
    expect(setRowUnit(draft, ROW, VAR.id).units).toEqual({});
  });

  it('la vista previa usa el factor del backend y no se calcula si cambia la unidad o falta la regla', () => {
    const draft = editCell(EMPTY_DRAFT, ROW, EMPTY_FEB, '1000');
    expect(previewTonnage('1000', ROW, EMPTY_FEB, draft)).toBe('3.35');
    expect(previewTonnage('1000', ROW, EMPTY_FEB, setRowUnit(draft, ROW, KG.id))).toBeNull();
    expect(previewTonnage('1000', row({ conversion: null }), EMPTY_FEB, draft)).toBeNull();
    expect(previewTonnage('1000', ROW, savedCell(1, '5', { unit: KG }), draft)).toBeNull();
  });

  it('los errores lines[i] se asignan a su celda; 409 FORECAST_LINE_STALE devuelve las celdas en conflicto (AC-03.71, AC-03.82)', () => {
    const keys = [KEY_JAN, KEY_FEB];
    expect(
      lineErrorsByCell(
        apiError(422, 'INVALID_QUANTITY', [{ field: 'lines[1].quantity', code: 'INVALID_QUANTITY', message: 'x', index: 1 }]),
        keys,
      ),
    ).toEqual({ [KEY_FEB]: 'Debe ser mayor o igual que 0.' });
    expect(lineErrorsByCell(apiError(400, 'VALIDATION_FAILED', [{ field: 'lines.0.quantity', issue: 'x' }]), keys)).toEqual({ [KEY_JAN]: 'El valor no es válido.' });
    const stale = apiError(409, 'FORECAST_LINE_STALE', [{ index: 0, lineId: 'l-1', updatedAt: '2026-12-05T10:00:00.000Z' }]);
    expect(staleKeys(stale, keys)).toEqual([KEY_JAN]);
    expect(lineErrorsByCell(stale, keys)).toEqual({});
  });

  it('recargar tras un 409 descarta solo las celdas en conflicto y conserva el resto del borrador', () => {
    let draft = setRowUnit(EMPTY_DRAFT, ROW, KG.id);
    draft = editCell(draft, ROW, EMPTY_FEB, '10');
    draft = editCell(draft, ROW, SAVED, '150');
    const kept = discardCells(draft, [KEY_JAN]);
    expect(Object.keys(kept.cells)).toEqual([KEY_FEB]);
    expect(buildSavePayload(kept).lines.map((line) => line.month)).toEqual([2]);
  });
});
