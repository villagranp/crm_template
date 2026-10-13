/**
 * Claves que el Módulo 3 usa de la configuración compartida (03 §D.4, §D.5, RN-03.1).
 * Un único sitio para que servicios, pruebas y documentación no las repitan.
 */

export const PROJECT_PERMISSIONS = {
  view: 'proyectos.ver',
  create: 'proyectos.crear',
  edit: 'proyectos.editar',
  delete: 'proyectos.eliminar',
  administer: 'proyectos.administrar',
} as const;

/** Permisos de otros recursos que deciden `capabilities` del proyecto (RN-03.19). */
export const RELATED_PERMISSIONS = {
  opportunityCreate: 'oportunidades.crear',
  opportunityAdminister: 'oportunidades.administrar',
  forecastEdit: 'forecast.editar',
  forecastAdminister: 'forecast.administrar',
} as const;

export const PROJECT_CATALOGS = {
  projectType: 'crm.tipo_proyecto',
  sector: 'crm.sector_proyecto',
  phase: 'crm.fase_cliente',
  stage: 'crm.etapa_oportunidad',
  productStatus: 'crm.estado_producto_asociado',
} as const;

export const PROJECT_PARAMETERS = {
  requiredFields: 'crm.campos_obligatorios',
  defaultValues: 'crm.valores_por_defecto',
  progressRules: 'crm.proyectos.reglas_avance',
  timeZone: 'crm.zona_horaria_negocio',
  forecastHorizon: 'crm.forecast.horizonte_meses',
  baseCurrency: 'crm.moneda_base',
} as const;

/** Folio `PRY-{year}-{seq}` (RN-03.1, DM-17). */
export const PROJECT_SEQUENCE_KEY = 'crm.proyecto';

/** Claves de `crm.valores_por_defecto` que lee el módulo. */
export const PROJECT_DEFAULT_KEYS = {
  phase: 'project.phaseId',
  stage: 'opportunity.stageId',
} as const;
