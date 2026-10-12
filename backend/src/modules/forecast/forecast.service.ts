import { Inject, Injectable } from '@nestjs/common';

import { compareDecimal, type DecimalString } from '@/common/decimal';
import { PermissionDeniedError } from '@/common/errors/application-error';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import { TRANSACTION_RUNNER, type TransactionContext, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { noVisibility } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import { AuditService } from '@/modules/audit/audit.service';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { ProjectActor } from '@/modules/projects/project-access.service';
import { PROJECT_PARAMETERS } from '@/modules/projects/project-constants';
import { projectNotFound } from '@/modules/projects/project-errors';
import { PROJECTS_REPOSITORY, type ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';
import { type ConversionLookup, type ResolvedConversion, UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import {
  assignableLineOwners,
  canEditProjectForecast,
  canSetLineOwner,
  FORECAST_PERMISSIONS,
  type ForecastScopes,
  isCellEditable,
  missingForecastEditPermission,
} from './forecast-access';
import { FORECAST_LINE_AUDIT_EVENTS, FORECAST_LINE_AUDIT_RESOURCE, FORECAST_LINE_MASKED_FIELDS, forecastLineAuditState } from './forecast-audit';
import {
  type ForecastLineInput,
  forecastLineKey,
  forecastPairKey,
  validateForecastBatch,
  type ValidatedForecastLine,
} from './forecast-batch-validator';
import { FORECAST_CLOCK, type ForecastClock } from './forecast-clock';
import {
  FORECAST_ERROR_CODES,
  type ForecastIssue,
  forecastIssuesError,
  forecastLineStaleError,
  lineField,
  lineIssue,
  lineOwnerNotEditableError,
  type StaleLine,
} from './forecast-errors';
import { type ForecastTotals, forecastTotals, lineAmount, type RowTotals, rowTotals } from './forecast-totals';
import {
  computeForecastWindow,
  type ForecastMode,
  type ForecastPeriod,
  type ForecastWindow,
  isEditablePeriod,
  type PeriodSelection,
  selectPeriods,
} from './forecast-window';
import {
  FORECAST_REPOSITORY,
  type ForecastCriteria,
  type ForecastLineKey,
  type ForecastLineRecord,
  type ForecastLineWrite,
  type ForecastPair,
  type ForecastProjectRecord,
  type ForecastRepository,
  type ForecastRowRecord,
  type ForecastSortField,
  type ForecastUnit,
} from './ports/forecast.repository.port';

/** Consulta común de filas y totales (03 F.3 `ForecastQueryDto`), ya con los filtros repetibles como listas. */
export interface ForecastQuery {
  readonly mode: ForecastMode;
  readonly periods?: readonly string[];
  readonly from?: string;
  readonly to?: string;
  readonly projectIds: readonly string[];
  readonly productIds: readonly string[];
  readonly ownerIds: readonly string[];
  readonly search?: string | null;
}

export interface ForecastRowsQuery extends ForecastQuery, PageRequest {
  readonly sortBy: ForecastSortField;
  readonly sortOrder: 'asc' | 'desc';
}

export interface ForecastCellView extends ForecastPeriod {
  readonly line: ForecastLineRecord | null;
  readonly hasConversion: boolean;
  readonly editable: boolean;
}

export interface ForecastRowView {
  readonly record: ForecastRowRecord;
  /** Regla vigente para la unidad propuesta de la fila (vista previa del tonelaje). */
  readonly conversion: ResolvedConversion | null;
  readonly cells: readonly ForecastCellView[];
  readonly totals: RowTotals;
  readonly canEdit: boolean;
}

export interface SavedForecastLine extends ForecastLineKey {
  readonly lineId: string;
  readonly quantity: DecimalString;
  readonly unit: ForecastUnit;
  readonly tonnage: DecimalString | null;
  readonly updatedAt: Date;
}

export interface ForecastSaveResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly lines: readonly SavedForecastLine[];
}

/** Línea escrita en la transacción, para auditarla después. */
interface ChangedLine {
  readonly kind: 'created' | 'updated';
  readonly lineId: string;
  readonly key: ForecastLineKey;
  readonly before: ForecastLineWrite | null;
  readonly after: ForecastLineWrite;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function lookupKey(lookup: ConversionLookup): string {
  return `${lookup.fromUnitId}|${lookup.productId ?? ''}|${lookup.projectTypeId ?? ''}`;
}

function recordAsWrite(line: ForecastLineRecord): ForecastLineWrite {
  return {
    quantity: line.quantity,
    unitId: line.unit.id,
    conversionRuleId: line.conversion?.ruleId ?? null,
    conversionFactor: line.conversion?.factor ?? null,
    tonnage: line.tonnage,
    ownerId: line.owner.id,
    notes: line.notes,
  };
}

function unitRef(unit: ForecastUnit): ForecastUnit {
  return { id: unit.id, code: unit.code, symbol: unit.symbol, dimension: unit.dimension };
}

/**
 * Forecast comercial M+6 (03 F-20, C.10, F.3).
 *
 * - Ventana: DEF-G con el reloj inyectable (`FORECAST_CLOCK`) y los parámetros
 *   `crm.zona_horaria_negocio` y `crm.forecast.horizonte_meses` (RN-03.66).
 * - Visibilidad con el alcance de `forecast.ver` (DM-13, H.1); edición con la política de
 *   Proyectos `canEditForecast` (RN-03.71) y el alcance de `forecast.administrar`.
 * - Guardado en lote atómico (RN-03.72): validación pura → visibilidad (404) y política
 *   (403) por proyecto → reglas de conversión resueltas antes de la transacción → una
 *   transacción que bloquea los proyectos (`FOR UPDATE`, orden de id) y las líneas
 *   existentes, comprueba asociación, unidad y `expectedUpdatedAt`, hace *upsert* por la
 *   clave única y actualiza `last_activity_at`. La auditoría va después (PLAN-ADMIN §10).
 */
@Injectable()
export class ForecastService {
  constructor(
    @Inject(FORECAST_REPOSITORY) private readonly repository: ForecastRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(FORECAST_CLOCK) private readonly clock: ForecastClock,
    private readonly scopeResolver: VisibilityScopeResolver,
    private readonly conversions: UnitConversionResolver,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  /** Ventana vigente M+1 … M+N (`GET /forecast/window`). */
  async window(): Promise<ForecastWindow> {
    const [timeZone, horizonMonths] = await Promise.all([
      this.parameters.get<string>(PROJECT_PARAMETERS.timeZone),
      this.parameters.get<number>(PROJECT_PARAMETERS.forecastHorizon),
    ]);
    return computeForecastWindow(this.clock.now(), { timeZone, horizonMonths });
  }

  async rows(actor: ProjectActor, query: ForecastRowsQuery): Promise<Page<ForecastRowView>> {
    const window = await this.window();
    const selection = selectPeriods(window, query);
    const scopes = await this.scopes(actor);
    const criteria = this.criteria(query, selection);
    const page = await this.repository.listRows(
      { ...criteria, page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortOrder: query.sortOrder },
      scopes.view,
    );
    const pairs = page.items.map((row) => ({ projectId: row.project.id, productId: row.product.id }));
    const [lines, conversions] = await Promise.all([
      pairs.length > 0 ? this.repository.listLines(pairs, criteria.periods, scopes.view) : Promise.resolve([]),
      this.resolveAll(
        page.items.map((row) => ({ fromUnitId: row.defaultUnit.id, productId: row.product.id, projectTypeId: row.project.projectTypeId })),
      ),
    ]);

    const linesByCell = new Map(lines.map((line) => [forecastLineKey(line), line]));
    const items = page.items.map((record) => {
      const canEdit = canEditProjectForecast(actor, { ownerId: record.project.owner.id, countryId: record.project.countryId, visible: record.project.visible }, scopes);
      const conversion =
        conversions.get(lookupKey({ fromUnitId: record.defaultUnit.id, productId: record.product.id, projectTypeId: record.project.projectTypeId })) ?? null;
      const cells: ForecastCellView[] = selection.periods.map((period) => {
        const line = linesByCell.get(forecastLineKey({ projectId: record.project.id, productId: record.product.id, year: period.year, month: period.month })) ?? null;
        return {
          ...period,
          line,
          hasConversion: line ? line.tonnage !== null : conversion !== null,
          editable: isCellEditable({ rowCanEdit: canEdit, mode: selection.mode, inWindow: isEditablePeriod(window, period) }),
        };
      });
      const rowLines = cells.map((cell) => cell.line).filter((line): line is ForecastLineRecord => line !== null);
      return { record, conversion, cells, totals: rowTotals(rowLines.map(lineAmount)), canEdit };
    });
    return { items, totalItems: page.totalItems, page: page.page, pageSize: page.pageSize };
  }

  /** Totales con los mismos filtros, sobre todas las filas (no la página) (RN-03.74). */
  async totals(actor: ProjectActor, query: ForecastQuery): Promise<ForecastTotals> {
    const window = await this.window();
    const selection = selectPeriods(window, query);
    const scopes = await this.scopes(actor);
    const groups = await this.repository.totals(this.criteria(query, selection), scopes.view);
    return forecastTotals(
      selection.periods,
      groups.map((group) => ({
        year: group.year,
        month: group.month,
        unit: group.unit,
        quantity: group.quantity,
        tonnage: group.tonnage,
        linesWithoutConversion: group.linesWithoutConversion,
      })),
    );
  }

  /** `PUT /forecast/lines`: guardado en lote atómico e idempotente (03 F.3). */
  async save(actor: ProjectActor, input: readonly ForecastLineInput[]): Promise<ForecastSaveResult> {
    const window = await this.window();
    const lines = validateForecastBatch(window, input);
    const scopes = await this.scopes(actor);
    const projectsById = await this.authorizeProjects(actor, lines, scopes);
    await this.authorizeOwners(actor, lines, projectsById, scopes);

    // Lecturas previas (fuera de la transacción): líneas y asociaciones actuales para
    // resolver de antemano las reglas de todas las unidades candidatas.
    const keys = lines.map((line): ForecastLineKey => ({ projectId: line.projectId, productId: line.productId, year: line.year, month: line.month }));
    const pairs = this.uniquePairs(lines);
    const [existingBefore, associationsBefore] = await Promise.all([this.repository.findLines(keys), this.repository.associationUnits(pairs)]);
    const existingByKey = new Map(existingBefore.map((line) => [forecastLineKey(line), line]));
    const associationByPair = new Map(associationsBefore.map((association) => [forecastPairKey(association), association.unitId]));
    const conversions = await this.resolveAll(
      lines.flatMap((line) => {
        const project = this.mustProject(projectsById, line.projectId);
        const candidates = line.unitId
          ? [line.unitId]
          : [existingByKey.get(forecastLineKey(line))?.unit.id, associationByPair.get(forecastPairKey(line))].filter((id): id is string => id !== undefined);
        return unique(candidates).map((unitId) => ({ fromUnitId: unitId, productId: line.productId, projectTypeId: project.projectTypeId }));
      }),
    );

    const at = new Date();
    const outcome = await this.transactions.run(async (tx) => {
      // Orden ascendente de id: dos lotes con proyectos en común no se interbloquean.
      for (const projectId of [...projectsById.keys()].sort()) {
        if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw projectNotFound(projectId);
      }
      const associations = new Map((await this.repository.associationUnits(pairs, tx)).map((association) => [forecastPairKey(association), association.unitId]));
      const locked = new Map((await this.repository.lockLines(keys, tx)).map((line) => [forecastLineKey(line), line]));
      const units = await this.validateReferences(lines, associations, locked, tx);
      this.assertFresh(lines, locked);

      const results: SavedForecastLine[] = [];
      const changed: ChangedLine[] = [];
      let unchanged = 0;
      for (const line of lines) {
        const project = this.mustProject(projectsById, line.projectId);
        const key = keys[line.index] as ForecastLineKey;
        const existing = locked.get(forecastLineKey(line)) ?? null;
        const unitId = line.unitId ?? existing?.unit.id ?? (associations.get(forecastPairKey(line)) as string);
        const ownerId = line.ownerId ?? existing?.owner.id ?? project.ownerId;
        const notes = line.notes === undefined ? (existing?.notes ?? null) : line.notes;
        const unit = units.get(unitId) as ForecastUnit;

        if (existing && compareDecimal(existing.quantity, line.quantity) === 0 && existing.unit.id === unitId && existing.owner.id === ownerId && existing.notes === notes) {
          unchanged += 1;
          results.push({ ...key, lineId: existing.id, quantity: existing.quantity, unit: unitRef(existing.unit), tonnage: existing.tonnage, updatedAt: existing.updatedAt });
          continue;
        }

        const lookup = { fromUnitId: unitId, productId: line.productId, projectTypeId: project.projectTypeId };
        // Sin regla resuelta de antemano (la unidad cambió entre la lectura previa y el bloqueo): se resuelve en la transacción.
        const conversion = conversions.has(lookupKey(lookup)) ? (conversions.get(lookupKey(lookup)) ?? null) : await this.conversions.resolve(lookup, tx);
        const write: ForecastLineWrite = {
          quantity: line.quantity,
          unitId,
          conversionRuleId: conversion?.ruleId ?? null,
          conversionFactor: conversion?.factor ?? null,
          tonnage: conversion ? this.conversions.tonnageFor(line.quantity, conversion) : null,
          ownerId,
          notes,
        };
        if (existing) {
          // `updatedAt` siempre avanza: la concurrencia optimista compara instantes exactos.
          const updatedAt = new Date(Math.max(at.getTime(), existing.updatedAt.getTime() + 1));
          await this.repository.updateLine(existing.id, write, actor.userId, updatedAt, tx);
          changed.push({ kind: 'updated', lineId: existing.id, key, before: recordAsWrite(existing), after: write });
          results.push({ ...key, lineId: existing.id, quantity: write.quantity, unit: unitRef(unit), tonnage: write.tonnage, updatedAt });
        } else {
          const lineId = await this.repository.createLine(key, write, actor.userId, at, tx);
          changed.push({ kind: 'created', lineId, key, before: null, after: write });
          results.push({ ...key, lineId, quantity: write.quantity, unit: unitRef(unit), tonnage: write.tonnage, updatedAt: at });
        }
      }

      await this.projects.touchLastActivity(unique(changed.map((line) => line.key.projectId)).sort(), at, tx);
      return { results, changed, unchanged };
    });

    const created = outcome.changed.filter((line) => line.kind === 'created').length;
    this.logger.info('forecast_lines_saved', {
      correlationId: actor.audit.correlationId,
      projectIds: [...projectsById.keys()],
      created,
      updated: outcome.changed.length - created,
      unchanged: outcome.unchanged,
    });
    for (const line of outcome.changed) {
      await this.audit.record(line.kind === 'created' ? FORECAST_LINE_AUDIT_EVENTS.created : FORECAST_LINE_AUDIT_EVENTS.updated, actor.audit, {
        resourceType: FORECAST_LINE_AUDIT_RESOURCE,
        resourceId: line.lineId,
        before: line.before ? forecastLineAuditState(line.before) : null,
        after: forecastLineAuditState(line.after),
        maskedFields: FORECAST_LINE_MASKED_FIELDS,
        metadata: { projectId: line.key.projectId, productId: line.key.productId, year: line.key.year, month: line.key.month },
      });
    }
    return { created, updated: outcome.changed.length - created, unchanged: outcome.unchanged, lines: outcome.results };
  }

  /** Alcances de `forecast.ver` y, si lo tiene, de `forecast.administrar` (una lectura del perfil). */
  private async scopes(actor: ProjectActor): Promise<ForecastScopes> {
    const permissions = [FORECAST_PERMISSIONS.view, ...(actor.permissions.has(FORECAST_PERMISSIONS.administer) ? [FORECAST_PERMISSIONS.administer] : [])];
    const resolved = await this.scopeResolver.resolveMany(actor.userId, permissions);
    return {
      view: resolved.get(FORECAST_PERMISSIONS.view) ?? noVisibility(actor.userId),
      administer: resolved.get(FORECAST_PERMISSIONS.administer) ?? noVisibility(actor.userId),
    };
  }

  private criteria(query: ForecastQuery, selection: PeriodSelection): ForecastCriteria {
    return {
      periods: selection.periods.map((period) => ({ year: period.year, month: period.month })),
      projectIds: unique(query.projectIds.map((id) => id.toLowerCase())),
      productIds: unique(query.productIds.map((id) => id.toLowerCase())),
      ownerIds: unique(query.ownerIds.map((id) => id.toLowerCase())),
      search: normalizeName(query.search ?? null),
    };
  }

  /** Reglas vigentes de cada búsqueda distinta (`null` = "sin conversión"). Fuera de transacción. */
  private async resolveAll(lookups: readonly ConversionLookup[]): Promise<Map<string, ResolvedConversion | null>> {
    const distinct = new Map(lookups.map((lookup) => [lookupKey(lookup), lookup]));
    const entries = await Promise.all([...distinct.entries()].map(async ([key, lookup]) => [key, await this.conversions.resolve(lookup)] as const));
    return new Map(entries);
  }

  /** Visibilidad (404) y política de edición (403) de cada proyecto del lote, en orden de aparición. */
  private async authorizeProjects(actor: ProjectActor, lines: readonly ValidatedForecastLine[], scopes: ForecastScopes): Promise<Map<string, ForecastProjectRecord>> {
    const projectIds = unique(lines.map((line) => line.projectId));
    const visible = new Map((await this.repository.findVisibleProjects(projectIds, scopes.view)).map((project) => [project.id.toLowerCase(), project]));
    for (const projectId of projectIds) {
      if (!visible.has(projectId)) throw projectNotFound(projectId);
    }
    for (const projectId of projectIds) {
      const project = this.mustProject(visible, projectId);
      if (!canEditProjectForecast(actor, { ...project, visible: true }, scopes)) {
        throw new PermissionDeniedError(missingForecastEditPermission(actor, project));
      }
    }
    return new Map(projectIds.map((projectId) => [projectId, this.mustProject(visible, projectId)]));
  }

  /**
   * Asesor de la línea (RN-03.70, DM-25): otro que el del proyecto exige `forecast.administrar`
   * (`403 FIELD_NOT_EDITABLE`); con él, debe ser asignable dentro de su alcance, `ACTIVE` y con
   * `forecast.ver` (`422 INVALID_OWNER`).
   */
  private async authorizeOwners(
    actor: ProjectActor,
    lines: readonly ValidatedForecastLine[],
    projects: ReadonlyMap<string, ForecastProjectRecord>,
    scopes: ForecastScopes,
  ): Promise<void> {
    const foreign = lines.filter((line) => line.ownerId !== null && line.ownerId !== this.mustProject(projects, line.projectId).ownerId.toLowerCase());
    const notEditable = foreign.filter((line) => !canSetLineOwner(actor, line.ownerId as string, this.mustProject(projects, line.projectId).ownerId.toLowerCase()));
    if (notEditable.length > 0) {
      throw lineOwnerNotEditableError(
        notEditable.map((line) => lineField(line.index, 'ownerId')),
        FORECAST_PERMISSIONS.administer,
      );
    }
    if (foreign.length === 0) return;
    const assignable = assignableLineOwners(actor, scopes);
    const candidates = unique(foreign.map((line) => line.ownerId as string));
    const eligible = new Set<string>();
    for (const ownerId of candidates) {
      const found = await this.projects.findEligibleOwner(ownerId, assignable, FORECAST_PERMISSIONS.view);
      if (found) eligible.add(found.toLowerCase());
    }
    const issues = foreign.filter((line) => !eligible.has(line.ownerId as string)).map((line) => lineIssue(line.index, 'ownerId', FORECAST_ERROR_CODES.invalidOwner));
    if (issues.length > 0) throw forecastIssuesError(issues);
  }

  /**
   * Dentro de la transacción: asociación activa del producto (RN-03.68, DM-25) y unidad activa
   * (una unidad desactivada se conserva si la línea ya la tenía y no cambia). Todas las
   * incidencias juntas.
   */
  private async validateReferences(
    lines: readonly ValidatedForecastLine[],
    associations: ReadonlyMap<string, string>,
    locked: ReadonlyMap<string, ForecastLineRecord>,
    tx: TransactionContext,
  ): Promise<Map<string, ForecastUnit>> {
    const issues: ForecastIssue[] = [];
    const unitIds = new Map<number, string>();
    for (const line of lines) {
      const association = associations.get(forecastPairKey(line));
      if (association === undefined) {
        issues.push(lineIssue(line.index, 'productId', FORECAST_ERROR_CODES.productNotAssociated));
        continue;
      }
      unitIds.set(line.index, line.unitId ?? locked.get(forecastLineKey(line))?.unit.id ?? association);
    }
    const units = new Map((await this.repository.findUnits(unique([...unitIds.values()]), tx)).map((unit) => [unit.id.toLowerCase(), unit]));
    for (const line of lines) {
      const unitId = unitIds.get(line.index);
      if (unitId === undefined) continue;
      const unit = units.get(unitId);
      const keepsInactive = locked.get(forecastLineKey(line))?.unit.id === unitId;
      if (!unit || (!unit.isActive && !keepsInactive)) issues.push(lineIssue(line.index, 'unitId', FORECAST_ERROR_CODES.unknownReference));
    }
    if (issues.length > 0) throw forecastIssuesError(issues.sort((a, b) => (a['index'] as number) - (b['index'] as number)));
    return new Map([...units.entries()].map(([id, unit]) => [id, unitRef(unit)]));
  }

  /** Concurrencia optimista (RN-03.73, D-03.6): igualdad exacta al milisegundo; todas las líneas en conflicto. */
  private assertFresh(lines: readonly ValidatedForecastLine[], locked: ReadonlyMap<string, ForecastLineRecord>): void {
    const stale: StaleLine[] = [];
    for (const line of lines) {
      if (line.expectedUpdatedAt === null) continue;
      const existing = locked.get(forecastLineKey(line));
      if (!existing || existing.updatedAt.getTime() !== line.expectedUpdatedAt.getTime()) {
        stale.push({ index: line.index, lineId: existing?.id ?? null, updatedAt: existing?.updatedAt ?? null });
      }
    }
    if (stale.length > 0) throw forecastLineStaleError(stale);
  }

  private uniquePairs(lines: readonly ValidatedForecastLine[]): ForecastPair[] {
    const pairs = new Map(lines.map((line) => [forecastPairKey(line), { projectId: line.projectId, productId: line.productId }]));
    return [...pairs.values()];
  }

  private mustProject(projects: ReadonlyMap<string, ForecastProjectRecord>, projectId: string): ForecastProjectRecord {
    const project = projects.get(projectId);
    if (!project) throw projectNotFound(projectId);
    return project;
  }
}
