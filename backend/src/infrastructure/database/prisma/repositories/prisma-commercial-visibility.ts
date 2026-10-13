import { Prisma } from '@prisma/client';

import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';

import { isEmptyScope, visibilityScopeSql } from '../sql-text';

const SQL_ALIAS = /^[a-z][a-z0-9_]*$/;

function alias(name: string): Prisma.Sql {
  if (!SQL_ALIAS.test(name)) {
    throw new Error(`Invalid SQL alias: ${name}`);
  }
  return Prisma.raw(name);
}

/**
 * Predicado SQL de visibilidad de visitas y actividades (04 H.3, 00 §4.2, DM-13)
 * sobre el alias del registro (`visits` o `activities`, con `owner_id` y
 * `project_id`) y el de su cliente (`customers`, por `country_id`):
 *
 * ```text
 * scope = ALL
 * OR r.owner_id IN (:ownerIds) OR c.country_id IN (:countryIds)                   (directo)
 * OR EXISTS (proyecto vinculado, no eliminado, dentro del alcance de proyectos)     (herencia)
 * ```
 *
 * No filtra eliminados. Exportado para los modelos de lectura de agenda,
 * interacciones y seguimiento, y para Inicio y Reportes: deben filtrar exactamente igual.
 */
export function commercialVisibilitySql(recordAlias: string, customerAlias: string, visibility: CommercialVisibility): Prisma.Sql {
  const r = alias(recordAlias);
  const c = alias(customerAlias);
  if (visibility.direct.kind === 'ALL') return Prisma.sql`TRUE`;
  const direct = visibilityScopeSql(visibility.direct, Prisma.sql`${r}.owner_id`, Prisma.sql`${c}.country_id`);
  if (isEmptyScope(visibility.inherited)) return direct;
  const projectScope = visibilityScopeSql(visibility.inherited, Prisma.sql`vp.owner_id`, Prisma.sql`vp.country_id`);
  return Prisma.sql`(${direct} OR (${r}.project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects vp
    WHERE vp.id = ${r}.project_id AND vp.deleted_at IS NULL AND ${projectScope}
  )))`;
}

/** Alternativas del predicado como filtro de Prisma; `null` = sin filtro (`ALL`). */
function commercialVisibilityAlternatives(visibility: CommercialVisibility): {
  ownerIds: string[];
  countryIds: string[];
  project: Prisma.ProjectWhereInput | null;
} | null {
  const { direct, inherited } = visibility;
  if (direct.kind === 'ALL') return null;
  const project: Prisma.ProjectWhereInput | null = isEmptyScope(inherited)
    ? null
    : inherited.kind === 'ALL'
      ? { deletedAt: null }
      : { deletedAt: null, OR: [{ ownerId: { in: [...inherited.ownerIds] } }, { countryId: { in: [...inherited.countryIds] } }] };
  return { ownerIds: [...direct.ownerIds], countryIds: [...direct.countryIds], project };
}

/** Mismo predicado que `commercialVisibilitySql`, como filtro de Prisma sobre `activities` (consultas por id). */
export function activityVisibilityWhere(visibility: CommercialVisibility): Prisma.ActivityWhereInput {
  const alternatives = commercialVisibilityAlternatives(visibility);
  if (!alternatives) return {};
  const or: Prisma.ActivityWhereInput[] = [
    { ownerId: { in: alternatives.ownerIds } },
    { customer: { countryId: { in: alternatives.countryIds } } },
  ];
  if (alternatives.project) or.push({ project: { is: alternatives.project } });
  return { OR: or };
}
