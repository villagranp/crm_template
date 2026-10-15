import type { SanitizableColumn } from '@/modules/customer-imports/cell-sanitizer';

/**
 * Definición única de las plantillas de la carga inicial por scripts
 * (`docs/implementation-plans/CARGA-INICIAL.md`): la usan la generación de plantillas, la lectura,
 * la validación de encabezados y la prueba que compara las plantillas versionadas en
 * `docs/templates/` con el código. Mismo patrón que `customer-imports/import-template.ts`.
 *
 * Cambiar un encabezado, añadir o quitar una columna es un cambio de plantilla: se sube
 * `INITIAL_DATA_TEMPLATE_VERSION` y se regeneran los archivos de `docs/templates/`
 * (`pnpm --filter @app/backend run load:data:templates`).
 */

export const INITIAL_DATA_TEMPLATE_VERSION = '1';

export const INITIAL_DATA_ENTITIES = ['projects', 'products', 'safety-minutes'] as const;
export type InitialDataEntity = (typeof INITIAL_DATA_ENTITIES)[number];

/** Cómo se interpreta el valor de la celda. */
export type LoadValueType = 'text' | 'code' | 'date' | 'integer';

export type SheetId = 'projects' | 'families' | 'products' | 'safety-minutes';

export interface LoadColumn {
  readonly key: string;
  readonly header: string;
  readonly required: boolean;
  readonly valueType: LoadValueType;
  /** `null` = sin longitud propia (referencia por código). */
  readonly maxLength: number | null;
  /** Texto libre al que se aplica la regla de fórmulas. */
  readonly isFreeText: boolean;
  readonly description: string;
  /** Ejemplo ficticio de la hoja de instrucciones. */
  readonly example: string;
}

export interface LoadSheet {
  readonly id: SheetId;
  /** Nombre de la hoja del libro XLSX. */
  readonly sheetName: string;
  /** Sufijo del archivo CSV de esta hoja (`''` = el archivo principal; las familias llevan `-familias`). */
  readonly csvSuffix: string;
  /** Una hoja CSV opcional puede faltar (se trata como vacía); en XLSX todas las hojas son obligatorias. */
  readonly optionalInCsv: boolean;
  readonly columns: readonly LoadColumn[];
}

export interface EntityDefinition {
  readonly entity: InitialDataEntity;
  readonly label: string;
  /** Nombre base de los archivos de plantilla (`plantilla-proyectos`). */
  readonly fileBase: string;
  /** En el orden en que se procesan (las familias antes que los productos). */
  readonly sheets: readonly LoadSheet[];
}

const PROJECT_COLUMNS: readonly LoadColumn[] = [
  { key: 'name', header: 'Nombre del proyecto', required: true, valueType: 'text', maxLength: 200, isFreeText: true, description: 'Nombre del proyecto.', example: 'Edificio Torre Ejemplo' },
  {
    key: 'customerCrmCode',
    header: 'Código CRM del cliente',
    required: true,
    valueType: 'code',
    maxLength: 30,
    isFreeText: false,
    description:
      'Código CRM que el sistema asignó al cliente al crearlo (único en todo el sistema; se ve en la ficha del cliente). El cliente debe existir, estar activo y no estar eliminado.',
    example: 'CLI-2026-00001',
  },
  {
    key: 'country',
    header: 'País',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código ISO de dos letras de un país activo (ver hoja Valores válidos). Vacío: el país del cliente.',
    example: 'GT',
  },
  { key: 'city', header: 'Ciudad', required: false, valueType: 'text', maxLength: 120, isFreeText: true, description: 'Ciudad o ubicación, texto libre.', example: 'Ciudad de Guatemala' },
  { key: 'address', header: 'Dirección', required: false, valueType: 'text', maxLength: 300, isFreeText: true, description: 'Dirección de la obra.', example: 'Avenida 1, zona 1' },
  { key: 'description', header: 'Descripción', required: false, valueType: 'text', maxLength: 10000, isFreeText: true, description: 'Descripción del proyecto.', example: 'Proyecto ficticio de ejemplo' },
  {
    key: 'estimatedStartDate',
    header: 'Fecha estimada de inicio',
    required: false,
    valueType: 'date',
    maxLength: 10,
    isFreeText: false,
    description: 'Fecha AAAA-MM-DD. Escríbala como texto, no como fecha de Excel.',
    example: '2027-01-15',
  },
  {
    key: 'estimatedEndDate',
    header: 'Fecha estimada de fin',
    required: false,
    valueType: 'date',
    maxLength: 10,
    isFreeText: false,
    description: 'Fecha AAAA-MM-DD, igual o posterior a la de inicio.',
    example: '2027-12-15',
  },
  {
    key: 'estimatedDecisionDate',
    header: 'Fecha estimada de decisión',
    required: false,
    valueType: 'date',
    maxLength: 10,
    isFreeText: false,
    description: 'Fecha AAAA-MM-DD, sin restricción respecto a inicio y fin.',
    example: '2026-12-01',
  },
  {
    key: 'owner',
    header: 'Responsable',
    required: false,
    valueType: 'code',
    maxLength: 320,
    isFreeText: false,
    description: 'Correo o código de colaborador de un usuario activo. Vacío: quien ejecuta la carga (--actor).',
    example: 'responsable@example.invalid',
  },
  {
    key: 'projectType',
    header: 'Tipo de proyecto',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código de un tipo de proyecto activo (ver hoja Valores válidos).',
    example: 'EDIFICIO',
  },
  {
    key: 'sector',
    header: 'Sector',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código de un sector de proyecto activo (ver hoja Valores válidos).',
    example: 'COMERCIAL',
  },
  {
    key: 'code',
    header: 'Código de proyecto',
    required: false,
    valueType: 'code',
    maxLength: 30,
    isFreeText: false,
    description: 'Opcional; si se deja vacío el sistema asigna el folio PRY-AAAA-nnnnn. Se guarda en mayúsculas y es único.',
    example: 'PRY-EJEMPLO-001',
  },
];

const FAMILY_COLUMNS: readonly LoadColumn[] = [
  {
    key: 'code',
    header: 'Código de familia',
    required: true,
    valueType: 'code',
    maxLength: 40,
    isFreeText: false,
    description: 'Letras, dígitos, guion y guion bajo (1 a 40). Se guarda en mayúsculas; no se puede cambiar después.',
    example: 'ACERO-LARGO',
  },
  { key: 'name', header: 'Nombre', required: true, valueType: 'text', maxLength: 120, isFreeText: true, description: 'Nombre de la familia.', example: 'Aceros largos' },
  { key: 'description', header: 'Descripción', required: false, valueType: 'text', maxLength: 400, isFreeText: true, description: 'Descripción de la familia.', example: 'Familia ficticia de ejemplo' },
  { key: 'sortOrder', header: 'Orden', required: false, valueType: 'integer', maxLength: 6, isFreeText: false, description: 'Entero de 0 a 100000. Vacío: 0.', example: '10' },
];

const PRODUCT_COLUMNS: readonly LoadColumn[] = [
  {
    key: 'sku',
    header: 'SKU',
    required: true,
    valueType: 'code',
    maxLength: 60,
    isFreeText: false,
    description: 'Código de material, único. Letras, dígitos, espacios y . _ - / (1 a 60); se guarda en mayúsculas.',
    example: 'VAR-3-8',
  },
  { key: 'description', header: 'Descripción', required: true, valueType: 'text', maxLength: 300, isFreeText: true, description: 'Descripción del producto.', example: 'Varilla corrugada 3/8 (ejemplo)' },
  {
    key: 'family',
    header: 'Código de familia',
    required: true,
    valueType: 'code',
    maxLength: 40,
    isFreeText: false,
    description: 'Código de una familia activa: una que ya existe (hoja Valores válidos) o una definida en la hoja Familias del mismo archivo.',
    example: 'ACERO-LARGO',
  },
  {
    key: 'baseUnit',
    header: 'Código de unidad base',
    required: true,
    valueType: 'code',
    maxLength: 20,
    isFreeText: false,
    description: 'Código de una unidad de medida activa (ver hoja Valores válidos).',
    example: 'VAR',
  },
];

const MINUTE_COLUMNS: readonly LoadColumn[] = [
  {
    key: 'displayDate',
    header: 'Fecha de visualización',
    required: true,
    valueType: 'date',
    maxLength: 10,
    isFreeText: false,
    description:
      'Fecha AAAA-MM-DD en la que se muestra el mensaje: hoy o una fecha futura (zona horaria del negocio). Una sola por fecha. Escríbala como texto.',
    example: '2027-02-01',
  },
  {
    key: 'message',
    header: 'Mensaje',
    required: true,
    valueType: 'text',
    maxLength: 1000,
    isFreeText: true,
    description: 'Texto plano de 1 a 1000 caracteres, sin HTML ni caracteres de control.',
    example: 'Mensaje ficticio de ejemplo: use siempre el casco en la obra.',
  },
];

export const ENTITY_DEFINITIONS: Readonly<Record<InitialDataEntity, EntityDefinition>> = {
  projects: {
    entity: 'projects',
    label: 'proyectos',
    fileBase: 'plantilla-proyectos',
    sheets: [{ id: 'projects', sheetName: 'Proyectos', csvSuffix: '', optionalInCsv: false, columns: PROJECT_COLUMNS }],
  },
  products: {
    entity: 'products',
    label: 'productos y familias',
    fileBase: 'plantilla-productos',
    sheets: [
      { id: 'families', sheetName: 'Familias', csvSuffix: '-familias', optionalInCsv: true, columns: FAMILY_COLUMNS },
      { id: 'products', sheetName: 'Productos', csvSuffix: '', optionalInCsv: false, columns: PRODUCT_COLUMNS },
    ],
  },
  'safety-minutes': {
    entity: 'safety-minutes',
    label: 'minutos de seguridad',
    fileBase: 'plantilla-minuto-seguridad',
    sheets: [{ id: 'safety-minutes', sheetName: 'Minutos', csvSuffix: '', optionalInCsv: false, columns: MINUTE_COLUMNS }],
  },
};

export function isInitialDataEntity(value: string): value is InitialDataEntity {
  return (INITIAL_DATA_ENTITIES as readonly string[]).includes(value);
}

export function entityDefinition(entity: InitialDataEntity): EntityDefinition {
  return ENTITY_DEFINITIONS[entity];
}

/** Lo que el saneamiento de celdas de `customer-imports` necesita de una columna. */
export function sanitizableColumn(column: LoadColumn): SanitizableColumn {
  // En fechas y enteros la longitud la decide el formato (INVALID_DATE, INVALID_INTEGER), no la longitud de la celda.
  const formatted = column.valueType === 'date' || column.valueType === 'integer';
  return { key: column.key, maxLength: formatted ? null : column.maxLength, kind: column.valueType === 'text' ? 'text' : 'code', isFreeText: column.isFreeText };
}

/** Nombre del archivo CSV de una hoja a partir del nombre base (`plantilla-productos` + `-familias` → `.csv`). */
export function csvFileName(base: string, sheet: LoadSheet): string {
  return `${base}${sheet.csvSuffix}.csv`;
}
