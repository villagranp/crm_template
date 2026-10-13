import type { ProjectProductRecord } from './ports/project-products.repository.port';
import type { ProjectRecord } from './ports/projects.repository.port';

/** `resourceType` y eventos de auditoría del módulo (03 RN-03.8, RN-03.13). */
export const PROJECT_AUDIT_RESOURCE = 'crm.project';
export const PROJECT_PRODUCT_AUDIT_RESOURCE = 'crm.project_product';

export const PROJECT_AUDIT_EVENTS = {
  created: 'crm.project.created',
  updated: 'crm.project.updated',
  deleted: 'crm.project.deleted',
  duplicated: 'crm.project.duplicated',
  classified: 'crm.project.classified',
  phaseChanged: 'crm.project.phase_changed',
} as const;

export const PROJECT_PRODUCT_AUDIT_EVENTS = {
  created: 'crm.project_product.created',
  updated: 'crm.project_product.updated',
  deleted: 'crm.project_product.deleted',
} as const;

/**
 * Eventos que repiten un historial funcional y no se muestran en el historial de la
 * ficha (03 F.1: prevalece el funcional). Los de oportunidades los emite el Módulo 3
 * en E2b con estos nombres (RN-03.53, F.2 paso 7).
 */
export const HISTORY_DUPLICATED_AUDIT_EVENTS = [
  PROJECT_AUDIT_EVENTS.phaseChanged,
  'crm.opportunity.stage_changed',
  'crm.opportunity_result.recorded',
  'crm.opportunity_result.changed',
  'crm.opportunity_result.cleared',
] as const;

/**
 * Texto libre que puede contener datos personales: la auditoría registra que cambió,
 * no su contenido (AGENTS §9.4, DM-29).
 */
export const PROJECT_MASKED_FIELDS = ['address', 'description'] as const;
export const PHASE_MASKED_FIELDS = ['comment'] as const;
export const PROJECT_PRODUCT_MASKED_FIELDS = ['notes'] as const;

/** Estado auditable de los datos generales (ids y valores de empresa, sin PII). */
export function projectAuditState(record: ProjectRecord): Record<string, unknown> {
  return {
    code: record.code,
    name: record.name,
    customerId: record.customer.id,
    countryId: record.country.id,
    city: record.city,
    address: record.address,
    description: record.description,
    estimatedStartDate: record.estimatedStartDate,
    estimatedEndDate: record.estimatedEndDate,
    estimatedDecisionDate: record.estimatedDecisionDate,
    ownerId: record.owner.id,
  };
}

export function classificationAuditState(record: ProjectRecord): Record<string, unknown> {
  return {
    projectTypeId: record.projectType?.id ?? null,
    sectorId: record.sector?.id ?? null,
    measureUnitId: record.measureUnit?.id ?? null,
    estimatedQuantity: record.estimatedQuantity,
    conversionRuleId: record.conversion?.ruleId ?? null,
    conversionFactor: record.conversion?.factor ?? null,
    estimatedTonnage: record.estimatedTonnage,
  };
}

export function projectProductAuditState(record: ProjectProductRecord): Record<string, unknown> {
  return {
    productId: record.product.id,
    opportunityId: record.opportunity?.id ?? null,
    quantity: record.quantity,
    unitId: record.unit.id,
    conversionRuleId: record.conversion?.ruleId ?? null,
    conversionFactor: record.conversion?.factor ?? null,
    tonnage: record.tonnage,
    statusId: record.status.id,
    notes: record.notes,
  };
}
