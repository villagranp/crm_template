import type { CustomerPickerValue } from '@/features/crm/customers';

import type { OpportunityRef, ProjectRef } from './commercial-activity.api';

/**
 * Vínculo comercial de una visita o actividad (RN-04.1): cliente obligatorio,
 * proyecto opcional del cliente y, sólo en actividades, oportunidad opcional del
 * proyecto. Lo editan `CustomerProjectFields` y lo resuelve, desde la query
 * string, `useCommercialPreselection`.
 */
export interface CommercialLinkValue {
  customer: CustomerPickerValue | null;
  project: ProjectRef | null;
  opportunity: OpportunityRef | null;
}

export const EMPTY_COMMERCIAL_LINK: CommercialLinkValue = { customer: null, project: null, opportunity: null };

/** Qué parte del vínculo cambió; quien lo usa decide qué más limpiar (p. ej. contactos al cambiar de cliente). */
export type CommercialLinkChange = 'customer' | 'project' | 'opportunity';

/** Ids preseleccionados desde una ficha (`?customerId=&projectId=&opportunityId=`, 04 §E.1). */
export interface CommercialPreselectionIds {
  customerId?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
}

/** Aplica un cambio de cliente o proyecto limpiando lo que depende de él (E.7, E.10). */
export function applyLinkChange(current: CommercialLinkValue, change: CommercialLinkChange, next: CommercialLinkValue): CommercialLinkValue {
  if (change === 'customer' && next.customer?.id !== current.customer?.id) {
    return { customer: next.customer, project: null, opportunity: null };
  }
  if (change === 'project' && next.project?.id !== current.project?.id) {
    return { ...next, opportunity: null };
  }
  return next;
}

/** Etiqueta "PRY-2026-00042 · Nombre". */
export function projectLabel(project: Pick<ProjectRef, 'code' | 'name'>): string {
  return `${project.code} · ${project.name}`;
}
