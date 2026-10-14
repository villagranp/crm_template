/**
 * Barril público de Actividad comercial para las fichas de Clientes (02) y
 * Proyectos (03) (04 §E.11, features/crm/README.md §1): lo único que esos
 * submódulos importan de aquí.
 *
 * - `NewActivityButton` (`customerId`, `projectId?`, `opportunityId?`): alta con preselección.
 * - `PlanVisitButton` (`customerId`, `projectId?`): planificar visita con preselección.
 * - `CommercialActivitySection` (`customerId` **o** `projectId`): seguimiento,
 *   próximas e historial reciente.
 *
 * Los tres se ocultan sin su permiso. La ficha decide además si el módulo está
 * disponible con `useModuleAvailability(CRM_MODULE_OPTION_KEYS.activities)` (D-02.10).
 */
export { CommercialActivitySection } from './CommercialActivitySection';
export type { CommercialActivitySectionProps } from './CommercialActivitySection';
export { NewActivityButton } from './NewActivityButton';
export type { NewActivityButtonProps } from './NewActivityButton';
export { PlanVisitButton } from './PlanVisitButton';
export type { PlanVisitButtonProps } from './PlanVisitButton';

/**
 * Zonas horarias y formatos de fecha del Módulo 4 que reutiliza Reportes (05 E.1, RN-05.7):
 * `useCommercialTimeZones()` (zona del perfil para instantes y `crm.zona_horaria_negocio`
 * para "hoy" y los períodos; la del navegador mientras cargan o sin `actividades.ver` /
 * `visitas.ver`), `formatDateTime`/`formatDate` con zona explícita, `formatCalendarDate`
 * (sin zona) y `todayInTimeZone`. Mismo comportamiento que en Actividad comercial.
 */
export { useCommercialTimeZones } from '../common/use-commercial-time-zones';
export type { CommercialTimeZones } from '../common/use-commercial-time-zones';
export { formatCalendarDate, formatDate, formatDateTime, todayInTimeZone } from '../common/date-time';
