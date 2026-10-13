import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { AuditContext } from '@/modules/audit/audit.service';

import type { ProjectAccessScopes } from '../project-access-policy';
import { type ProjectActor, toVisibleProject } from '../project-access.service';
import type { ProjectRecord } from '../ports/projects.repository.port';

/** Datos de prueba de las unitarias del Módulo 3 (excluidos del build). */

export const TX = { tx: true } as unknown as TransactionContext;
export const NOW = new Date('2026-10-11T15:00:00.000Z');
export const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'user-1', actorEmail: null, ipAddress: null };

export const PHASES = {
  diseno: { id: 'phase-diseno', code: 'DISENO', label: 'Diseño', metadata: { order: 1, isFinal: false }, isActive: true },
  cotizacion: { id: 'phase-cotizacion', code: 'COTIZACION', label: 'Cotización', metadata: { order: 2, isFinal: false }, isActive: true },
  finalizado: { id: 'phase-final', code: 'FINALIZADO', label: 'Finalizado', metadata: { order: 4, isFinal: true, defaultProgress: 100 }, isActive: true },
} as const;

export const STAGES = {
  contactado: { id: 'stage-contactado', code: 'CONTACTADO', label: 'Contactado', metadata: { order: 1, isClosed: false } },
  cotizando: { id: 'stage-cotizando', code: 'COTIZANDO', label: 'Cotizando', metadata: { order: 2, isClosed: false } },
  ganado: { id: 'stage-ganado', code: 'GANADO', label: 'Ganado', metadata: { order: 3, isClosed: true, outcome: 'WON' } },
  perdido: { id: 'stage-perdido', code: 'PERDIDO', label: 'Perdido', metadata: { order: 4, isClosed: true, outcome: 'LOST' } },
} as const;

export function makeActor(permissions: readonly string[], userId: string | null = 'user-1'): ProjectActor {
  return { userId, permissions: new Set(permissions), audit: AUDIT };
}

export function ownerScope(ownerIds: readonly string[], countryIds: readonly string[] = []): VisibilityScope {
  return { kind: 'FILTERED', userId: ownerIds[0] ?? null, dataScope: 'TEAM', ownerIds: [...ownerIds], teamIds: [], countryIds: [...countryIds] };
}

export const NO_SCOPE: VisibilityScope = { kind: 'FILTERED', userId: 'user-1', dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] };
export const ALL_SCOPE: VisibilityScope = { kind: 'ALL', userId: 'user-1', dataScope: 'ORGANIZATION' };

export function makeScopes(overrides: Partial<ProjectAccessScopes> = {}): ProjectAccessScopes {
  return {
    view: ownerScope(['user-1']),
    administer: NO_SCOPE,
    delete: NO_SCOPE,
    opportunityAdminister: NO_SCOPE,
    forecastAdminister: NO_SCOPE,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    code: 'PRY-2026-00001',
    name: 'Torre Norte',
    customer: { id: 'customer-1', legalName: 'Constructora Uno' },
    country: { id: 'country-gt', isoCode: 'GT', name: 'Guatemala', isActive: true },
    city: 'Guatemala',
    address: null,
    description: null,
    estimatedStartDate: null,
    estimatedEndDate: null,
    estimatedDecisionDate: null,
    owner: { id: 'user-1', displayName: 'Asesora Uno' },
    projectType: null,
    sector: null,
    measureUnit: null,
    estimatedQuantity: null,
    conversion: null,
    estimatedTonnage: null,
    phase: { ...PHASES.diseno },
    phaseProgress: '10.00',
    phaseUpdatedAt: NOW,
    phaseComment: null,
    duplicatedFrom: null,
    opportunities: [],
    productLines: 0,
    attachments: 0,
    lastActivityAt: NOW,
    deletedAt: null,
    createdAt: NOW,
    createdBy: { id: 'user-1', displayName: 'Asesora Uno' },
    updatedAt: NOW,
    updatedBy: null,
    ...overrides,
  };
}

/**
 * `TransactionRunner` que ejecuta el trabajo con `TX`, registra cuántas veces se abrió y
 * expone `active` mientras la transacción está abierta (para `poolOnly`).
 */
export function fakeTransactions(): TransactionRunner & { runs: number; active: boolean } {
  const runner = {
    runs: 0,
    active: false,
    async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
      runner.runs += 1;
      runner.active = true;
      try {
        return await work(TX);
      } finally {
        runner.active = false;
      }
    },
  };
  return runner;
}

/**
 * Doble de una lectura que va por el pool (alcances, parámetros): falla si se llama con
 * la transacción abierta (AGENTS §9.12; 03 "Precisiones", Revisión E5, M1).
 */
export function poolOnly<A extends unknown[], R>(runner: { readonly active: boolean }, name: string, read: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    if (runner.active) throw new Error(`${name} used a pool connection inside the transaction`);
    return read(...args);
  };
}

/**
 * Doble de `ProjectAccessService.lockEditable` sobre los dobles del repositorio: bloquea con
 * `lockProject` y relee con `findById(id, scopes.view, tx)` (`404` si falta), como el real.
 */
export function fakeLockEditable(repository: {
  lockProject: (projectId: string, mode: 'UPDATE' | 'SHARE', tx: TransactionContext) => Promise<boolean>;
  findById: (projectId: string, scope: VisibilityScope | null, tx?: TransactionContext) => Promise<ProjectRecord | null>;
}): jest.Mock {
  return jest.fn(async (_actor: ProjectActor, projectId: string, scopes: ProjectAccessScopes, tx: TransactionContext) => {
    const record = (await repository.lockProject(projectId, 'UPDATE', tx)) ? await repository.findById(projectId, scopes.view, tx) : null;
    if (!record) throw new ResourceNotFoundError('Project', projectId);
    return toVisibleProject(record, scopes);
  });
}
