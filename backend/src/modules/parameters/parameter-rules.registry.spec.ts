import {
  applyRule,
  catalogReferencesOf,
  PARAMETER_RULES,
  REMOVED_PARAMETER_KEYS,
  ruleFor,
  rulesReferencingCatalog,
} from './parameter-rules.registry';
import { PARAMETER_RANGES } from './parameter-value';

function rule(key: string) {
  const found = ruleFor(key);
  if (!found) throw new Error(`sin regla: ${key}`);
  return found;
}

/** Claves de 00 §8.2 (CRM y sistema). */
const CRM_KEYS = [
  'crm.zona_horaria_negocio',
  'crm.moneda_base',
  'crm.tipos_cambio.dias_aviso_antiguedad',
  'crm.alertas.actividad_por_vencer_horas',
  'crm.alertas.visita_sin_confirmar_horas',
  'crm.alertas.proyecto_sin_actualizar_dias',
  'crm.alertas.oportunidad_sin_siguiente_accion',
  'crm.alertas.prioridades',
  'crm.visitas.validar_conflicto_horario',
  'crm.visitas.duracion_por_defecto_minutos',
  'crm.oportunidades.transiciones_etapa',
  'crm.proyectos.reglas_avance',
  'crm.clientes.unicidad_codigo',
  'crm.clientes.reglas_duplicidad',
  'crm.contactos.reglas_duplicidad',
  'crm.campos_obligatorios',
  'crm.valores_por_defecto',
  'crm.forecast.horizonte_meses',
  'crm.forecast.unidad_tonelaje',
  'crm.importaciones.habilitada',
  'crm.importaciones.max_filas',
  'crm.importaciones.max_mb',
  'crm.importaciones.dias_retencion_filas',
  'crm.adjuntos.max_mb',
  'crm.adjuntos.tipos_permitidos',
  'crm.inicio.visitas_proximas_dias',
  'crm.reportes.max_filas_exportacion',
  'sistema.permite_datos_demo',
];

/** Valores por defecto de 00 §8.2 tal como los guarda la semilla esencial. */
const SEED_DEFAULTS: Record<string, string> = {
  'crm.zona_horaria_negocio': 'America/Guatemala',
  'crm.moneda_base': 'USD',
  'crm.tipos_cambio.dias_aviso_antiguedad': '31',
  'crm.alertas.actividad_por_vencer_horas': '48',
  'crm.alertas.visita_sin_confirmar_horas': '48',
  'crm.alertas.proyecto_sin_actualizar_dias': '30',
  'crm.alertas.oportunidad_sin_siguiente_accion': 'true',
  'crm.alertas.prioridades':
    '{"ACTIVIDAD_VENCIDA":"ALTA","VISITA_SIN_CONFIRMAR":"MEDIA","PROYECTO_SIN_ACTUALIZAR":"MEDIA","OPORTUNIDAD_SIN_SIGUIENTE_ACCION":"ALTA"}',
  'crm.visitas.validar_conflicto_horario': 'AVISAR',
  'crm.visitas.duracion_por_defecto_minutos': '60',
  'crm.oportunidades.transiciones_etapa':
    '{"CONTACTADO":["COTIZANDO","GANADO","PERDIDO"],"COTIZANDO":["CONTACTADO","GANADO","PERDIDO"],"GANADO":[],"PERDIDO":[]}',
  'crm.proyectos.reglas_avance': '{"FINALIZADO":{"progresoMinimo":100}}',
  'crm.clientes.unicidad_codigo': 'PAIS',
  'crm.clientes.reglas_duplicidad': '{"razonSocialNormalizada":"AVISAR","nit":"AVISAR"}',
  'crm.contactos.reglas_duplicidad': '{"correo":"BLOQUEAR","nombreCompleto":"AVISAR"}',
  'crm.campos_obligatorios':
    '{"customer":["legalName","countryId","statusId","salesOwnerId"],"project":["name","customerId","countryId","ownerId"],"visit":["customerId","scheduledStartAt","ownerId","objective"],"activity":["typeId","subject","customerId","ownerId","priorityId"]}',
  'crm.valores_por_defecto':
    '{"customer.statusId":"PROSPECTO","project.phaseId":"DISENO","opportunity.stageId":"CONTACTADO","activity.priorityId":"MEDIA"}',
  'crm.forecast.horizonte_meses': '6',
  'crm.forecast.unidad_tonelaje': 'TON',
  'crm.importaciones.habilitada': 'false',
  'crm.importaciones.max_filas': '5000',
  'crm.importaciones.max_mb': '10',
  'crm.importaciones.dias_retencion_filas': '90',
  'crm.adjuntos.max_mb': '10',
  'crm.adjuntos.tipos_permitidos':
    '["application/pdf","image/jpeg","image/png","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]',
  'crm.inicio.visitas_proximas_dias': '7',
  'crm.reportes.max_filas_exportacion': '100000',
  'sistema.permite_datos_demo': 'false',
};

/** Un valor inválido representativo por clave (fuera de rango, de lista o de esquema). */
const INVALID: Record<string, string[]> = {
  'crm.zona_horaria_negocio': ['Marte/Olympus', ''],
  'crm.moneda_base': ['GTQ'],
  'crm.tipos_cambio.dias_aviso_antiguedad': ['0', '367', '31.5'],
  'crm.alertas.actividad_por_vencer_horas': ['0', '721', 'abc'],
  'crm.alertas.visita_sin_confirmar_horas': ['0', '721'],
  'crm.alertas.proyecto_sin_actualizar_dias': ['0', '366'],
  'crm.alertas.oportunidad_sin_siguiente_accion': ['sí', '1'],
  'crm.alertas.prioridades': [
    '{"ACTIVIDAD_VENCIDA":"ALTA"}',
    '{"ACTIVIDAD_VENCIDA":"ALTA","VISITA_SIN_CONFIRMAR":"MEDIA","PROYECTO_SIN_ACTUALIZAR":"MEDIA","OPORTUNIDAD_SIN_SIGUIENTE_ACCION":"ALTA","OTRA":"ALTA"}',
    '[]',
  ],
  'crm.visitas.validar_conflicto_horario': ['SIEMPRE', 'avisar'],
  'crm.visitas.duracion_por_defecto_minutos': ['4', '1441'],
  'crm.oportunidades.transiciones_etapa': ['{}', '{"CONTACTADO":"GANADO"}', '{"CONTACTADO":["GANADO","GANADO"]}'],
  'crm.proyectos.reglas_avance': ['{"FINALIZADO":{"progresoMinimo":101}}', '{"FINALIZADO":{"minimo":100}}', '{"FINALIZADO":100}'],
  'crm.clientes.unicidad_codigo': ['NIT', 'pais'],
  'crm.clientes.reglas_duplicidad': [
    '{"razonSocialNormalizada":"AVISAR","nit":"BLOQUEAR"}',
    '{"razonSocialNormalizada":"QUIZA"}',
    '{"desconocida":"AVISAR"}',
  ],
  'crm.contactos.reglas_duplicidad': ['{"correo":"AVISAR"}', '{"nombreCompleto":"TAL_VEZ"}', '{"otra":"NO"}'],
  'crm.campos_obligatorios': ['{"customer":["noExiste"]}', '{"proveedor":["name"]}', '{"customer":["taxId","taxId"]}'],
  'crm.valores_por_defecto': ['{"customer.noExiste":"X"}', '{"customer.statusId":"con espacio"}'],
  'crm.forecast.horizonte_meses': ['0', '25'],
  'crm.forecast.unidad_tonelaje': ['ton', ''],
  'crm.importaciones.habilitada': ['yes'],
  'crm.importaciones.max_filas': ['0', '50001'],
  'crm.importaciones.max_mb': ['0', '11'],
  'crm.importaciones.dias_retencion_filas': ['0', '3651'],
  'crm.adjuntos.max_mb': ['0', '11'],
  'crm.adjuntos.tipos_permitidos': ['[]', '["application/zip"]', '["image/png","image/png"]'],
  'crm.inicio.visitas_proximas_dias': ['0', '61'],
  'crm.reportes.max_filas_exportacion': ['0', '1000001'],
  'sistema.permite_datos_demo': ['quizá'],
};

describe('registro de reglas de parámetros', () => {
  it('cubre todas las claves crm.* y sistema.* de 00 §8.2 y los rangos existentes', () => {
    for (const key of [...CRM_KEYS, ...Object.keys(PARAMETER_RANGES)]) {
      expect(ruleFor(key)).toBeDefined();
    }
  });

  it('no registra claves eliminadas (DM-4, DM-36)', () => {
    for (const key of REMOVED_PARAMETER_KEYS) {
      expect(ruleFor(key)).toBeUndefined();
    }
  });

  it('conserva los rangos de PARAMETER_RANGES', () => {
    for (const [key, range] of Object.entries(PARAMETER_RANGES)) {
      expect(rule(key).range).toEqual(range);
    }
  });

  it.each([...PARAMETER_RULES.values()].map((entry) => [entry.key, entry] as const))(
    '%s: su valor por defecto cumple la regla',
    (_key, entry) => {
      expect(applyRule(entry, entry.defaultValue)).toMatchObject({ ok: true });
    },
  );

  it.each(Object.entries(SEED_DEFAULTS))('%s: el valor de la semilla (00 §8.2) es válido y estable', (key, value) => {
    const result = applyRule(rule(key), value);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.stored).toBe(value);
    }
  });

  it.each(Object.entries(INVALID).flatMap(([key, values]) => values.map((value) => [key, value] as const)))(
    '%s rechaza %s',
    (key, value) => {
      const result = applyRule(rule(key), value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0]?.field).toMatch(/^value/);
        expect(result.issues[0]?.issue.length).toBeGreaterThan(0);
      }
    },
  );

  it('nit solo admite AVISAR o NO (RN-07.46)', () => {
    const duplicates = rule('crm.clientes.reglas_duplicidad');
    expect(applyRule(duplicates, '{"nit":"NO"}')).toMatchObject({ ok: true });
    expect(applyRule(duplicates, '{"nit":"BLOQUEAR"}')).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ field: 'value.nit', issue: expect.stringContaining('AVISAR o NO') })],
    });
  });

  it('crm.campos_obligatorios siempre incluye los obligatorios de base', () => {
    const result = applyRule(rule('crm.campos_obligatorios'), '{"customer":["taxId"],"visitCompletion":["topics"]}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        customer: ['legalName', 'countryId', 'statusId', 'salesOwnerId', 'taxId'],
        project: ['name', 'customerId', 'countryId', 'ownerId'],
        visit: ['customerId', 'scheduledStartAt', 'ownerId', 'objective'],
        activity: ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'],
        visitCompletion: ['actualStartAt', 'topics'],
      });
    }
  });

  it('marca solo lectura y requiresConfigure según RN-07.32 y RN-07.46', () => {
    expect(rule('crm.moneda_base').readOnly).toBe(true);
    const structural = [...PARAMETER_RULES.values()].filter((entry) => entry.requiresConfigure).map((entry) => entry.key);
    expect(structural.sort()).toEqual(
      [
        'crm.forecast.horizonte_meses',
        'crm.forecast.unidad_tonelaje',
        'crm.importaciones.habilitada',
        'crm.moneda_base',
        'crm.zona_horaria_negocio',
        'auditoria.dias_retencion',
        'seguridad.dias_caducidad_password',
        'seguridad.intentos_fallidos_maximos',
        'seguridad.minutos_bloqueo',
        'sistema.permite_datos_demo',
      ].sort(),
    );
  });

  describe('referencias a catálogos', () => {
    function referencesOf(key: string, value: string) {
      const entry = rule(key);
      const result = applyRule(entry, value);
      if (!result.ok) throw new Error('valor inválido');
      return catalogReferencesOf(entry, result.value);
    }

    it('valores por defecto: cada campo con su catálogo', () => {
      expect(referencesOf('crm.valores_por_defecto', SEED_DEFAULTS['crm.valores_por_defecto']!)).toEqual(
        expect.arrayContaining([
          { field: 'value.customer.statusId', catalogKey: 'crm.estado_cliente', code: 'PROSPECTO' },
          { field: 'value.project.phaseId', catalogKey: 'crm.fase_cliente', code: 'DISENO' },
          { field: 'value.opportunity.stageId', catalogKey: 'crm.etapa_oportunidad', code: 'CONTACTADO' },
          { field: 'value.activity.priorityId', catalogKey: 'crm.prioridad', code: 'MEDIA' },
        ]),
      );
    });

    it('transiciones: origen y destinos en crm.etapa_oportunidad', () => {
      expect(referencesOf('crm.oportunidades.transiciones_etapa', '{"CONTACTADO":["GANADO"]}')).toEqual([
        { field: 'value.CONTACTADO', catalogKey: 'crm.etapa_oportunidad', code: 'CONTACTADO' },
        { field: 'value.CONTACTADO.0', catalogKey: 'crm.etapa_oportunidad', code: 'GANADO' },
      ]);
    });

    it('reglas de avance y prioridades de alertas', () => {
      expect(referencesOf('crm.proyectos.reglas_avance', '{"FINALIZADO":{"progresoMinimo":100}}')).toEqual([
        { field: 'value.FINALIZADO', catalogKey: 'crm.fase_cliente', code: 'FINALIZADO' },
      ]);
      expect(referencesOf('crm.alertas.prioridades', SEED_DEFAULTS['crm.alertas.prioridades']!)).toHaveLength(4);
    });

    it('rulesReferencingCatalog lista los parámetros de RN-07.26', () => {
      expect(rulesReferencingCatalog('crm.prioridad').map((entry) => entry.key).sort()).toEqual([
        'crm.alertas.prioridades',
        'crm.valores_por_defecto',
      ]);
      expect(rulesReferencingCatalog('crm.etapa_oportunidad').map((entry) => entry.key).sort()).toEqual([
        'crm.oportunidades.transiciones_etapa',
        'crm.valores_por_defecto',
      ]);
      expect(rulesReferencingCatalog('crm.motivo_cancelacion')).toEqual([]);
    });
  });
});
