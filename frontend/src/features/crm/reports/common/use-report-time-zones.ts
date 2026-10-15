import { useMemo } from 'react';

import { isValidTimeZone } from '@/features/crm/commercial-activity/entry-points';

import { useReportFilterOptions } from '../filter-options.queries';

/**
 * Zonas horarias de presentación de Reportes (RN-05.7, P-05.27), publicadas por
 * `GET /reports/filter-options` (con el mismo `reportes.ver` que el resto del módulo; ya no
 * dependen de los `form-options` de Actividad comercial):
 *
 * - `timeZone`: zona del perfil del usuario, para los instantes (`*At`).
 * - `businessTimeZone`: `crm.zona_horaria_negocio`, para "hoy" y los atajos de período.
 *
 * `undefined` = zona del navegador (mientras cargan, si fallan o si `Intl` no reconoce la zona).
 * Comparte caché con los selectores de filtro: no añade peticiones.
 */
export interface ReportTimeZones {
  timeZone: string | undefined;
  businessTimeZone: string | undefined;
}

export function useReportTimeZones(): ReportTimeZones {
  const { data } = useReportFilterOptions();
  const timeZone = data?.timeZone;
  const businessTimeZone = data?.businessTimeZone;
  return useMemo(
    () => ({
      timeZone: isValidTimeZone(timeZone) ? timeZone : undefined,
      businessTimeZone: isValidTimeZone(businessTimeZone) ? businessTimeZone : undefined,
    }),
    [timeZone, businessTimeZone],
  );
}
