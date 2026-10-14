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
