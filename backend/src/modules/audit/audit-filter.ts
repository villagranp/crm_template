import { BadRequestException } from '@nestjs/common';

import type { AuditLogFilter } from './ports/audit-query.repository.port';

/** Filtros de la bitácora tal como llegan en la query (ya validados por el DTO). */
export interface AuditLogFilterInput {
  event?: string;
  search?: string;
  subjectId?: string;
  resourceType?: string;
  resourceId?: string;
  correlationId?: string;
  /** ISO 8601: fecha (`2026-10-08`) o fecha y hora. */
  from?: string;
  to?: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX_WILDCARD = '*';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseDate(raw: string, field: string): Date {
  const date = new Date(DATE_ONLY.test(raw) ? `${raw}T00:00:00.000Z` : raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException([`${field} must be a valid ISO 8601 date`]);
  }
  return date;
}

/**
 * Traduce los filtros de la API a criterios del puerto (PLAN-ADMIN, D11).
 *
 * - `event` termina en `.` o en `*` → prefijo (`auth.` o `auth.*` = todos los
 *   eventos de autenticación); si no, coincidencia exacta.
 * - `from` es inclusivo. `to` con sólo fecha incluye ese día entero (UTC); con
 *   hora, es inclusivo hasta ese instante.
 * - `from` posterior a `to` → `400`.
 */
export function buildAuditFilter(input: AuditLogFilterInput): AuditLogFilter {
  const filter: AuditLogFilter = {};

  const event = clean(input.event);
  if (event) {
    if (event.endsWith(PREFIX_WILDCARD)) {
      const prefix = event.slice(0, -PREFIX_WILDCARD.length);
      if (prefix) {
        filter.eventPrefix = prefix;
      }
    } else if (event.endsWith('.')) {
      filter.eventPrefix = event;
    } else {
      filter.event = event;
    }
  }

  const subjectSearch = clean(input.search);
  if (subjectSearch) filter.subjectSearch = subjectSearch;
  const subjectId = clean(input.subjectId);
  if (subjectId) filter.subjectId = subjectId;
  const resourceType = clean(input.resourceType);
  if (resourceType) filter.resourceType = resourceType;
  const resourceId = clean(input.resourceId);
  if (resourceId) filter.resourceId = resourceId;
  const correlationId = clean(input.correlationId);
  if (correlationId) filter.correlationId = correlationId;

  const from = clean(input.from);
  const to = clean(input.to);
  if (from) {
    filter.occurredFrom = parseDate(from, 'from');
  }
  if (to) {
    const end = parseDate(to, 'to');
    filter.occurredBefore = DATE_ONLY.test(to) ? new Date(end.getTime() + ONE_DAY_MS) : new Date(end.getTime() + 1);
  }
  if (filter.occurredFrom && filter.occurredBefore && filter.occurredFrom >= filter.occurredBefore) {
    throw new BadRequestException(['from must be earlier than or equal to to']);
  }

  return filter;
}

/** Filtros activos como metadatos planos, para auditar una exportación. */
export function describeAuditFilter(input: AuditLogFilterInput): Record<string, string> {
  const described: Record<string, string> = {};
  for (const [key, value] of Object.entries(input) as [keyof AuditLogFilterInput, string | undefined][]) {
    const cleaned = clean(value);
    if (cleaned) {
      described[`filter.${key}`] = cleaned.slice(0, 200);
    }
  }
  return described;
}
