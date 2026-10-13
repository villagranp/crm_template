import { useMemo } from 'react';

import { usePermission } from '@/hooks/use-permission';

import { useActivityFormOptions } from '../activities/activities.queries';
import { useVisitFormOptions } from '../visits/visits.queries';

import { ACTIVITY_PERMISSIONS, VISIT_PERMISSIONS } from './commercial-activity.permissions';
import { isValidTimeZone } from './date-time';

/**
 * Zonas horarias de presentación de Actividad comercial (RN-04.9, D-04.17).
 * `undefined` = zona del navegador (mientras cargan o si no están disponibles).
 */
export interface CommercialTimeZones {
  /** Zona del perfil del usuario (`users.time_zone`): instantes y entradas `datetime-local`. */
  timeZone: string | undefined;
  /** `crm.zona_horaria_negocio`: fechas de calendario y "hoy". */
  businessTimeZone: string | undefined;
}

/**
 * Zonas que publican los `form-options` del módulo: los de actividades con
 * `actividades.ver`; si no, los de visitas con `visitas.ver`. Comparte caché con
 * las pantallas que ya los piden (lector pasivo: sin recargas al montarse ni
 * reintentos tras un fallo; si fallan, se usa la zona del navegador). Una zona que
 * `Intl` no reconoce se ignora (se usa la del navegador) en lugar de romper el
 * formateo.
 */
export function useCommercialTimeZones(): CommercialTimeZones {
  const canViewActivities = usePermission(ACTIVITY_PERMISSIONS.view);
  const canViewVisits = usePermission(VISIT_PERMISSIONS.view);
  // Lectores pasivos: muchos componentes leen la zona y ninguno debe provocar recargas al montarse.
  const activityOptions = useActivityFormOptions(canViewActivities, { passive: true });
  const visitOptions = useVisitFormOptions(!canViewActivities && canViewVisits, { passive: true });
  const source = canViewActivities ? activityOptions.data : visitOptions.data;
  const timeZone = source?.timeZone;
  const businessTimeZone = source?.businessTimeZone;

  return useMemo(
    () => ({
      timeZone: isValidTimeZone(timeZone) ? timeZone : undefined,
      businessTimeZone: isValidTimeZone(businessTimeZone) ? businessTimeZone : undefined,
    }),
    [timeZone, businessTimeZone],
  );
}

/** Zona de unos `form-options` ya cargados (formularios y diálogos), o `undefined` si falta o no es válida. */
export function formTimeZone(options: { timeZone?: string } | undefined): string | undefined {
  const timeZone = options?.timeZone;
  return isValidTimeZone(timeZone) ? timeZone : undefined;
}
