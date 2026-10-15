import type { ParameterGroup, SystemParameter } from './parameters.api';

/**
 * Agrupación **visual** de los parámetros (07 E.4). Se deriva del prefijo de la
 * clave; el `group` guardado en la base no cambia. El orden de las secciones es
 * el de la pantalla: Acceso, Interfaz, las del CRM y, al final, el resto por su `group`.
 */

export type ParameterSectionId =
  | 'acceso'
  | 'interfaz'
  | 'crm-duplicidad'
  | 'crm-campos'
  | 'crm-alertas'
  | 'crm-avance'
  | 'crm-forecast'
  | 'crm-importaciones'
  | 'crm-otros';

export interface ParameterSection {
  /** Id de la sección CRM/Acceso, o `group:<grupo>` para el resto. */
  id: string;
  label: string;
  parameters: SystemParameter[];
}

interface SectionRule {
  id: ParameterSectionId;
  label: string;
  /** Claves exactas o prefijos terminados en `.`. */
  matches: readonly string[];
}

/** El orden importa: gana la primera regla que encaja con la clave. */
const SECTION_RULES: readonly SectionRule[] = [
  { id: 'acceso', label: 'Acceso', matches: ['seguridad.'] },
  { id: 'interfaz', label: 'Interfaz', matches: ['ui.'] },
  {
    id: 'crm-duplicidad',
    label: 'CRM — Duplicidad',
    matches: [
      'crm.clientes.unicidad_codigo',
      'crm.clientes.reglas_duplicidad',
      'crm.contactos.reglas_duplicidad',
    ],
  },
  {
    id: 'crm-campos',
    label: 'Campos y valores por defecto',
    matches: [
      'crm.campos_obligatorios',
      'crm.valores_por_defecto',
      'crm.zona_horaria_negocio',
      'crm.visitas.',
    ],
  },
  { id: 'crm-alertas', label: 'Alertas y vencimientos', matches: ['crm.alertas.', 'crm.inicio.'] },
  {
    id: 'crm-avance',
    label: 'Reglas de avance',
    matches: ['crm.proyectos.reglas_avance', 'crm.oportunidades.transiciones_etapa'],
  },
  {
    id: 'crm-forecast',
    label: 'Forecast, conversiones y moneda',
    matches: ['crm.forecast.', 'crm.moneda_base', 'crm.tipos_cambio.'],
  },
  {
    id: 'crm-importaciones',
    label: 'Importaciones y adjuntos',
    matches: ['crm.importaciones.', 'crm.adjuntos.'],
  },
  { id: 'crm-otros', label: 'CRM — Otros', matches: ['crm.'] },
];

/** Claves eliminadas por decisión (DM-4, DM-36). El backend ya no las devuelve; si llegan, no se muestran. */
export const REMOVED_PARAMETER_KEYS: readonly string[] = [
  'crm.clientes.unicidad_nit',
  'crm.moneda_por_defecto',
];

const GROUP_LABELS: Readonly<Record<string, string>> = {
  general: 'General',
  seguridad: 'Seguridad',
  auditoria: 'Auditoría',
  interfaz: 'Interfaz',
  sistema: 'Sistema',
  crm: 'CRM',
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

function matchesKey(key: string, match: string): boolean {
  return match.endsWith('.') ? key.startsWith(match) : key === match;
}

/** Sección CRM/Acceso de una clave, o `null` si se agrupa por su `group`. */
export function sectionRuleFor(key: string): { id: ParameterSectionId; label: string } | null {
  const rule = SECTION_RULES.find((candidate) =>
    candidate.matches.some((match) => matchesKey(key, match)),
  );
  return rule ? { id: rule.id, label: rule.label } : null;
}

/** Reparte los grupos de `GET /parameters` en las secciones de la pantalla, en su orden. */
export function toSections(groups: readonly ParameterGroup[]): ParameterSection[] {
  const known = new Map<string, ParameterSection>();
  const others = new Map<string, ParameterSection>();

  for (const group of groups) {
    for (const parameter of group.parameters) {
      if (REMOVED_PARAMETER_KEYS.includes(parameter.key)) {
        continue;
      }
      const rule = sectionRuleFor(parameter.key);
      const target = rule ? known : others;
      const id = rule ? rule.id : `group:${parameter.group}`;
      const section = target.get(id) ?? {
        id,
        label: rule ? rule.label : groupLabel(parameter.group),
        parameters: [],
      };
      section.parameters.push(parameter);
      target.set(id, section);
    }
  }

  const ordered = SECTION_RULES.map((rule) => known.get(rule.id)).filter(
    (section): section is ParameterSection => section !== undefined,
  );
  const rest = [...others.values()].sort((left, right) =>
    left.label.localeCompare(right.label, 'es'),
  );
  return [...ordered, ...rest];
}
