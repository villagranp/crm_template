/**
 * Claves que usa Oportunidades (03 §D.4, §D.5, RN-03.37, C.7, C.8, C.11). Un único
 * sitio para servicios, pruebas y documentación.
 */

export const OPPORTUNITY_PERMISSIONS = {
  view: 'oportunidades.ver',
  create: 'oportunidades.crear',
  edit: 'oportunidades.editar',
  close: 'oportunidades.cerrar',
  delete: 'oportunidades.eliminar',
  administer: 'oportunidades.administrar',
} as const;

export const OPPORTUNITY_CATALOGS = {
  stage: 'crm.etapa_oportunidad',
  outcome: 'crm.resultado_oportunidad',
  reason: 'crm.motivo_resultado',
} as const;

export const OPPORTUNITY_PARAMETERS = {
  transitions: 'crm.oportunidades.transiciones_etapa',
  defaultValues: 'crm.valores_por_defecto',
  timeZone: 'crm.zona_horaria_negocio',
} as const;

/** Clave de `crm.valores_por_defecto` con la etapa inicial (RN-03.39). */
export const DEFAULT_STAGE_KEY = 'opportunity.stageId';

/** Folio `OPO-{year}-{seq}` (RN-03.37). */
export const OPPORTUNITY_SEQUENCE_KEY = 'crm.oportunidad';

/** Escalas decimales de la API (RN-03.30, RN-03.80): montos y tonelajes 4, tasas 8, porcentajes 2. */
export const AMOUNT_DECIMALS = 4;
export const RATE_DECIMALS = 8;
export const PERCENT_DECIMALS = 2;
