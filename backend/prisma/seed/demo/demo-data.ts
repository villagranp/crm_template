/**
 * Datos FICTICIOS de la semilla de demostración (00 §8.3). Ningún nombre de
 * cliente ni de persona es real; correos en dominios `.invalid`.
 *
 * Todo lo sembrado lleva marca para poder identificarlo y purgarlo:
 * códigos `DEMO-…`, usuarios `@demo.invalid`, reglas y metas con `[DEMO]`,
 * tipos de cambio con fuente `DEMO …`. Los códigos `DEMO-` no consumen las
 * secuencias reales.
 *
 * Valores ilustrativos inventados (no son datos del negocio): SKU y
 * descripciones de productos, factores de conversión por producto, familia y
 * tipo de proyecto, tipos de cambio, montos, cantidades y metas.
 */

export const DEMO_PREFIX = 'DEMO-';
export const DEMO_EMAIL_DOMAIN = '@demo.invalid';
export const DEMO_TAG = '[DEMO]';
export const DEMO_RATE_SOURCE = 'DEMO — valor ilustrativo, no oficial';

export interface DemoTeam {
  code: string;
  name: string;
  parentCode?: string;
  managerEmployeeCode?: string;
}

export const DEMO_TEAMS: DemoTeam[] = [
  { code: 'DEMO-GT', name: 'Ventas Guatemala (demo)', managerEmployeeCode: 'DEMO-E003' },
  { code: 'DEMO-GT-NORTE', name: 'Ventas Guatemala Norte (demo)', parentCode: 'DEMO-GT' },
  { code: 'DEMO-GT-SUR', name: 'Ventas Guatemala Sur (demo)', parentCode: 'DEMO-GT' },
  { code: 'DEMO-SV', name: 'Ventas El Salvador (demo)', managerEmployeeCode: 'DEMO-E004' },
];

export interface DemoUser {
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  country: 'GT' | 'SV';
  role: 'asesor' | 'manager' | 'responsable-pais';
  team: string;
}

export const DEMO_USERS: DemoUser[] = [
  { employeeCode: 'DEMO-E001', email: 'responsable.gt@demo.invalid', firstName: 'Regina', lastName: 'Paz Demo', jobTitle: 'Responsable de país', country: 'GT', role: 'responsable-pais', team: 'DEMO-GT' },
  { employeeCode: 'DEMO-E002', email: 'responsable.sv@demo.invalid', firstName: 'Sergio', lastName: 'Mena Demo', jobTitle: 'Responsable de país', country: 'SV', role: 'responsable-pais', team: 'DEMO-SV' },
  { employeeCode: 'DEMO-E003', email: 'manager.gt@demo.invalid', firstName: 'Marta', lastName: 'López Demo', jobTitle: 'Jefa de ventas', country: 'GT', role: 'manager', team: 'DEMO-GT' },
  { employeeCode: 'DEMO-E004', email: 'manager.sv@demo.invalid', firstName: 'Carlos', lastName: 'Rivas Demo', jobTitle: 'Jefe de ventas', country: 'SV', role: 'manager', team: 'DEMO-SV' },
  { employeeCode: 'DEMO-E005', email: 'asesor1.gt@demo.invalid', firstName: 'Ana', lastName: 'Castillo Demo', jobTitle: 'Asesora comercial', country: 'GT', role: 'asesor', team: 'DEMO-GT-NORTE' },
  { employeeCode: 'DEMO-E006', email: 'asesor2.gt@demo.invalid', firstName: 'Luis', lastName: 'Herrera Demo', jobTitle: 'Asesor comercial', country: 'GT', role: 'asesor', team: 'DEMO-GT-NORTE' },
  { employeeCode: 'DEMO-E007', email: 'asesor3.gt@demo.invalid', firstName: 'Julia', lastName: 'Morales Demo', jobTitle: 'Asesora comercial', country: 'GT', role: 'asesor', team: 'DEMO-GT-SUR' },
  { employeeCode: 'DEMO-E008', email: 'asesor1.sv@demo.invalid', firstName: 'Diego', lastName: 'Flores Demo', jobTitle: 'Asesor comercial', country: 'SV', role: 'asesor', team: 'DEMO-SV' },
];

export interface DemoFamily {
  code: string;
  name: string;
}

export const DEMO_FAMILIES: DemoFamily[] = [
  { code: 'DEMO-VARILLA', name: 'Varilla corrugada (demo)' },
  { code: 'DEMO-ALAMBRE', name: 'Alambre (demo)' },
  { code: 'DEMO-PERFILES', name: 'Perfiles estructurales (demo)' },
  { code: 'DEMO-MALLA', name: 'Malla electrosoldada (demo)' },
];

export interface DemoProduct {
  sku: string;
  description: string;
  family: string;
  baseUnit: string;
  /** Regla por producto hacia TON (factor ilustrativo). */
  productFactor?: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  { sku: 'DEMO-VAR-3', description: 'Varilla corrugada #3 de 6 m (demo)', family: 'DEMO-VARILLA', baseUnit: 'VAR', productFactor: '0.00336' },
  { sku: 'DEMO-VAR-4', description: 'Varilla corrugada #4 de 6 m (demo)', family: 'DEMO-VARILLA', baseUnit: 'VAR', productFactor: '0.00596' },
  { sku: 'DEMO-VAR-5', description: 'Varilla corrugada #5 de 6 m (demo)', family: 'DEMO-VARILLA', baseUnit: 'VAR', productFactor: '0.00931' },
  { sku: 'DEMO-VAR-6', description: 'Varilla corrugada #6 de 6 m (demo)', family: 'DEMO-VARILLA', baseUnit: 'VAR', productFactor: '0.01341' },
  { sku: 'DEMO-ALA-16', description: 'Alambre de amarre calibre 16 (demo)', family: 'DEMO-ALAMBRE', baseUnit: 'KG' },
  { sku: 'DEMO-ALA-18', description: 'Alambre de amarre calibre 18 (demo)', family: 'DEMO-ALAMBRE', baseUnit: 'KG' },
  { sku: 'DEMO-VIGA-6', description: 'Viga IPE 6" (demo)', family: 'DEMO-PERFILES', baseUnit: 'M' },
  { sku: 'DEMO-ANG-2', description: 'Angular 2" x 2" (demo)', family: 'DEMO-PERFILES', baseUnit: 'M' },
  { sku: 'DEMO-MALLA-66', description: 'Malla electrosoldada 6x6 (demo)', family: 'DEMO-MALLA', baseUnit: 'M2' },
  { sku: 'DEMO-MALLA-44', description: 'Malla electrosoldada 4x4 (demo)', family: 'DEMO-MALLA', baseUnit: 'M2' },
];

/** Regla por familia: metro de perfil a tonelada (ilustrativa). */
export const DEMO_FAMILY_RULE = { family: 'DEMO-PERFILES', fromUnit: 'M', factor: '0.0125' };
/** Regla por tipo de proyecto: m² de vivienda a tonelada (estimación ilustrativa). */
export const DEMO_PROJECT_TYPE_RULE = { projectType: 'VIVIENDA', fromUnit: 'M2', factor: '0.025' };

/** Tasas ilustrativas por 1 USD para los meses M-2, M-1 y M (primer día). */
export const DEMO_RATES: Record<string, [string, string, string]> = {
  GTQ: ['7.75000000', '7.74000000', '7.73000000'],
  HNL: ['24.70000000', '24.75000000', '24.80000000'],
  CRC: ['512.00000000', '510.00000000', '508.00000000'],
  VES: ['36.50000000', '37.10000000', '37.80000000'],
};
