import type { Page } from '@/infrastructure/database/ports/pagination';

import type {
  ForecastRowDto,
  ForecastSaveResultDto,
  ForecastTotalsDto,
  ForecastWindowDto,
  PaginatedForecastRowsDto,
} from './dto/forecast.dto';
import type { ForecastTotals } from './forecast-totals';
import type { ForecastWindow } from './forecast-window';
import type { ForecastRowView, ForecastSaveResult } from './forecast.service';
import type { ForecastUnit } from './ports/forecast.repository.port';

function unitDto(unit: { readonly id: string; readonly code: string; readonly symbol: string; readonly dimension: string }): ForecastUnit {
  return { id: unit.id, code: unit.code, symbol: unit.symbol, dimension: unit.dimension as ForecastUnit['dimension'] };
}

export function toForecastWindowDto(window: ForecastWindow): ForecastWindowDto {
  return {
    timeZone: window.timeZone,
    current: { year: window.current.year, month: window.current.month },
    periods: window.periods.map((period) => ({ offset: period.offset, year: period.year, month: period.month, label: period.label })),
  };
}

export function toForecastRowDto(view: ForecastRowView): ForecastRowDto {
  const { record } = view;
  const updatedAts = view.cells.map((cell) => cell.line?.updatedAt.getTime()).filter((time): time is number => time !== undefined);
  return {
    project: { id: record.project.id, code: record.project.code, name: record.project.name, owner: { ...record.project.owner } },
    product: { id: record.product.id, sku: record.product.sku, description: record.product.description, family: { ...record.product.family } },
    unit: unitDto(record.defaultUnit),
    conversion: view.conversion ? { ruleId: view.conversion.ruleId, scope: view.conversion.scope, factor: view.conversion.factor } : null,
    cells: view.cells.map((cell) => ({
      year: cell.year,
      month: cell.month,
      offset: cell.offset,
      lineId: cell.line?.id ?? null,
      quantity: cell.line?.quantity ?? null,
      unit: cell.line ? unitDto(cell.line.unit) : null,
      tonnage: cell.line?.tonnage ?? null,
      hasConversion: cell.hasConversion,
      owner: cell.line ? { ...cell.line.owner } : null,
      updatedAt: cell.line ? cell.line.updatedAt.toISOString() : null,
      updatedBy: cell.line?.updatedBy ? { ...cell.line.updatedBy } : null,
      editable: cell.editable,
    })),
    rowTotals: {
      tonnage: view.totals.tonnage,
      quantitiesByUnit: view.totals.quantitiesByUnit.map((entry) => ({ unit: unitDto(entry.unit), quantity: entry.quantity })),
    },
    lastUpdatedAt: updatedAts.length > 0 ? new Date(Math.max(...updatedAts)).toISOString() : null,
    canEdit: view.canEdit,
    hasActiveAssociation: record.hasActiveAssociation,
  };
}

export function toForecastRowsDto(page: Page<ForecastRowView>): PaginatedForecastRowsDto {
  return {
    data: page.items.map(toForecastRowDto),
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      totalItems: page.totalItems,
      totalPages: page.pageSize > 0 ? Math.ceil(page.totalItems / page.pageSize) : 0,
    },
  };
}

export function toForecastTotalsDto(totals: ForecastTotals): ForecastTotalsDto {
  return {
    periods: totals.periods.map((period) => ({ ...period })),
    windowTonnage: totals.windowTonnage,
    quantitiesByUnit: totals.quantitiesByUnit.map((entry) => ({
      unit: unitDto(entry.unit),
      byPeriod: entry.byPeriod.map((period) => ({ year: period.year, month: period.month, quantity: period.quantity })),
      total: entry.total,
    })),
    linesWithoutConversion: totals.linesWithoutConversion,
  };
}

export function toForecastSaveResultDto(result: ForecastSaveResult): ForecastSaveResultDto {
  return {
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    lines: result.lines.map((line) => ({
      lineId: line.lineId,
      projectId: line.projectId,
      productId: line.productId,
      year: line.year,
      month: line.month,
      quantity: line.quantity,
      unit: unitDto(line.unit),
      tonnage: line.tonnage,
      updatedAt: line.updatedAt.toISOString(),
    })),
  };
}
