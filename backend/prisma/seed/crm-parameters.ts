/**
 * Parámetros del CRM (00 §8.2). `group = 'crm'` salvo `sistema.permite_datos_demo`.
 *
 * La semilla crea los que falten y NUNCA pisa su valor (puede haberlo ajustado
 * un administrador); solo actualiza nombre, descripción y grupo. Los JSON se
 * guardan como texto compacto con `JSON.stringify`.
 */
import type { SystemParameterSeed } from './access-catalog';

function json(value: unknown): string {
  return JSON.stringify(value);
}

function crm(
  key: string,
  type: SystemParameterSeed['type'],
  value: string,
  name: string,
  description: string,
): SystemParameterSeed {
  return { key, type, value, group: 'crm', name, description, isPublic: false };
}

export const CRM_PARAMETERS: SystemParameterSeed[] = [
  crm('crm.zona_horaria_negocio', 'STRING', 'America/Guatemala', 'Zona horaria del negocio', 'Límites de mes del forecast y "hoy" de los vencimientos (DM-2).'),
  crm(
    'crm.moneda_base',
    'STRING',
    'USD',
    'Moneda base',
    'Moneda de todos los totales e indicadores (DM-36). Estructural y de solo lectura: cambiarla invalidaría los equivalentes en USD.',
  ),
  crm(
    'crm.tipos_cambio.dias_aviso_antiguedad',
    'NUMBER',
    '31',
    'Días de antigüedad del tipo de cambio',
    'A partir de esta antigüedad el tipo de cambio aplicado genera el aviso EXCHANGE_RATE_STALE (1–366).',
  ),
  crm('crm.alertas.actividad_por_vencer_horas', 'NUMBER', '48', 'Horas para "actividad por vencer"', 'Una actividad abierta que vence dentro de estas horas se marca como próxima a vencer.'),
  crm('crm.alertas.visita_sin_confirmar_horas', 'NUMBER', '48', 'Horas de visita sin confirmar', 'Una visita realizada sin confirmar pasado este plazo genera alerta.'),
  crm('crm.alertas.proyecto_sin_actualizar_dias', 'NUMBER', '30', 'Días de proyecto sin actualizar', 'Un proyecto sin actividad durante estos días genera alerta.'),
  crm(
    'crm.alertas.oportunidad_sin_siguiente_accion',
    'BOOLEAN',
    'true',
    'Alerta de oportunidad sin siguiente acción',
    'Habilita la alerta de oportunidades abiertas sin siguiente acción.',
  ),
  crm(
    'crm.alertas.prioridades',
    'JSON',
    json({
      ACTIVIDAD_VENCIDA: 'ALTA',
      VISITA_SIN_CONFIRMAR: 'MEDIA',
      PROYECTO_SIN_ACTUALIZAR: 'MEDIA',
      OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'ALTA',
    }),
    'Prioridad de cada alerta',
    'Códigos del catálogo crm.prioridad por tipo de alerta.',
  ),
  crm('crm.visitas.validar_conflicto_horario', 'STRING', 'AVISAR', 'Conflicto de horario de visitas', 'NO | AVISAR | BLOQUEAR al programar dos visitas solapadas.'),
  crm('crm.visitas.duracion_por_defecto_minutos', 'NUMBER', '60', 'Duración por defecto de una visita', 'Minutos para calcular el fin planificado si no se indica.'),
  crm(
    'crm.oportunidades.transiciones_etapa',
    'JSON',
    json({
      CONTACTADO: ['COTIZANDO', 'GANADO', 'PERDIDO'],
      COTIZANDO: ['CONTACTADO', 'GANADO', 'PERDIDO'],
      GANADO: [],
      PERDIDO: [],
    }),
    'Transiciones de etapa permitidas',
    'Desde cada etapa, a cuáles se puede pasar (DM-6). Reabrir una cerrada exige oportunidades.administrar.',
  ),
  crm(
    'crm.proyectos.reglas_avance',
    'JSON',
    json({ FINALIZADO: { progresoMinimo: 100 } }),
    'Reglas de avance de fase',
    'Porcentaje mínimo exigido por fase (códigos de crm.fase_cliente).',
  ),
  crm('crm.clientes.unicidad_codigo', 'STRING', 'PAIS', 'Unicidad del código de cliente', 'PAIS (garantizado por la base) o GLOBAL (más estricto).'),
  crm(
    'crm.clientes.reglas_duplicidad',
    'JSON',
    json({ razonSocialNormalizada: 'AVISAR', nit: 'AVISAR' }),
    'Reglas de duplicidad de clientes',
    'Posibles duplicados: avisan, no bloquean. Para nit solo AVISAR o NO (DM-4: el NIT no es único).',
  ),
  crm(
    'crm.contactos.reglas_duplicidad',
    'JSON',
    json({ correo: 'BLOQUEAR', nombreCompleto: 'AVISAR' }),
    'Reglas de duplicidad de contactos',
    'Mismo correo en el mismo cliente bloquea; mismo nombre completo avisa (DM-5).',
  ),
  crm(
    'crm.campos_obligatorios',
    'JSON',
    json({
      customer: ['legalName', 'countryId', 'statusId', 'salesOwnerId'],
      project: ['name', 'customerId', 'countryId', 'ownerId'],
      visit: ['customerId', 'scheduledStartAt', 'ownerId', 'objective'],
      activity: ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'],
    }),
    'Campos obligatorios',
    'Solo puede añadir obligatorios a los que ya exige la base.',
  ),
  crm(
    'crm.valores_por_defecto',
    'JSON',
    json({
      'customer.statusId': 'PROSPECTO',
      'project.phaseId': 'DISENO',
      'opportunity.stageId': 'CONTACTADO',
      'activity.priorityId': 'MEDIA',
    }),
    'Valores por defecto',
    'Códigos de catálogo que se proponen al crear.',
  ),
  crm('crm.forecast.horizonte_meses', 'NUMBER', '6', 'Horizonte del forecast (meses)', 'Meses M+1…M+n del forecast.'),
  crm('crm.forecast.unidad_tonelaje', 'STRING', 'TON', 'Unidad de tonelaje', 'Unidad destino de las conversiones (código de units_of_measure).'),
  crm(
    'crm.importaciones.habilitada',
    'BOOLEAN',
    'false',
    'Carga masiva habilitada',
    'Habilitación productiva de la carga masiva de clientes (DM-28). Cambiarlo exige parametros.configurar.',
  ),
  crm('crm.importaciones.max_filas', 'NUMBER', '5000', 'Filas máximas por carga', 'Límite de filas por archivo.'),
  crm('crm.importaciones.max_mb', 'NUMBER', '10', 'Tamaño máximo de carga (MB)', 'Tamaño máximo del archivo de carga.'),
  crm('crm.importaciones.dias_retencion_filas', 'NUMBER', '90', 'Días de retención de filas importadas', 'Purga de los datos leídos (pueden contener datos personales).'),
  crm('crm.adjuntos.max_mb', 'NUMBER', '10', 'Tamaño máximo de adjunto (MB)', 'No puede superar el límite de cuerpo de NGINX (ADR-021).'),
  crm(
    'crm.adjuntos.tipos_permitidos',
    'JSON',
    json([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
    'Tipos de adjunto permitidos',
    'PDF, imágenes, Word y Excel (DM-8).',
  ),
  crm('crm.inicio.visitas_proximas_dias', 'NUMBER', '7', 'Días de "visitas próximas"', 'Horizonte de visitas próximas en Inicio y en el reporte de visitas (1–60).'),
  crm(
    'crm.reportes.max_filas_exportacion',
    'NUMBER',
    '100000',
    'Filas máximas de exportación',
    'Tope de filas de una exportación XLSX; por encima se rechaza (nunca se trunca).',
  ),
  {
    key: 'sistema.permite_datos_demo',
    type: 'BOOLEAN',
    value: 'false',
    group: 'sistema',
    name: 'Permite datos de demostración',
    description: 'Guardia de la semilla de demostración. Debe ser false en producción.',
    isPublic: false,
  },
];
