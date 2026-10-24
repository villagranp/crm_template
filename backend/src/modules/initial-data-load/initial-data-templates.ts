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

export const INITIAL_DATA_TEMPLATE_VERSION = '2';

export const INITIAL_DATA_ENTITIES = ['projects', 'products', 'safety-minutes', 'entra-identities', 'users'] as const;
export type InitialDataEntity = (typeof INITIAL_DATA_ENTITIES)[number];

/** Cómo se interpreta el valor de la celda. */
export type LoadValueType = 'text' | 'code' | 'date' | 'integer' | 'decimal';

export type SheetId = 'projects' | 'families' | 'products' | 'safety-minutes' | 'entra-identities' | 'users';

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
    required: false,
    valueType: 'code',
    maxLength: 30,
    isFreeText: false,
    description:
      'Código CRM que el sistema asignó al cliente al crearlo (único en todo el sistema; se ve en la ficha del cliente). Indique este código o el código de cliente, no los dos. El cliente debe existir, estar activo y no estar eliminado.',
    example: 'CLI-2026-00001',
  },
  {
    key: 'customerCode',
    header: 'Código de cliente',
    required: false,
    valueType: 'code',
    maxLength: 40,
    isFreeText: false,
    description:
      'Código del cliente en el sistema de origen (el de la carga de clientes). Alternativa al código CRM. Si varios países tienen un cliente con ese código, indique el País.',
    example: '90152',
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
  {
    key: 'measureUnit',
    header: 'Unidad de medida',
    required: false,
    valueType: 'code',
    maxLength: 20,
    isFreeText: false,
    description: 'Código de una unidad de medida activa en la que se mide el proyecto (ver hoja Valores válidos). Obligatoria si hay cantidad estimada.',
    example: 'M2',
  },
  {
    key: 'estimatedQuantity',
    header: 'Cantidad estimada',
    required: false,
    valueType: 'decimal',
    maxLength: null,
    isFreeText: false,
    description: 'Número mayor o igual a 0, con punto decimal y hasta 4 decimales, en la unidad de medida.',
    example: '1250.5',
  },
  {
    key: 'phase',
    header: 'Fase del cliente',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código de una fase del cliente activa (ver hoja Valores válidos). Vacío: la fase inicial por defecto.',
    example: 'CONSTRUCCION',
  },
  {
    key: 'phaseProgress',
    header: 'Avance de fase',
    required: false,
    valueType: 'decimal',
    maxLength: null,
    isFreeText: false,
    description: 'Porcentaje de avance de 0 a 100, hasta 2 decimales. Exige la fase del cliente.',
    example: '40',
  },
  {
    key: 'phaseComment',
    header: 'Comentario de fase',
    required: false,
    valueType: 'text',
    maxLength: 1000,
    isFreeText: true,
    description: 'Comentario del cambio de fase. Exige la fase del cliente.',
    example: 'Fase en el CRM anterior: Execution',
  },
  {
    key: 'opportunityStage',
    header: 'Etapa de oportunidad',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código de una etapa de oportunidad activa (ver hoja Valores válidos). Con valor se crea una oportunidad del proyecto, asignada a su responsable; vacío: sin oportunidad.',
    example: 'GANADO',
  },
  {
    key: 'opportunityDate',
    header: 'Fecha de oportunidad',
    required: false,
    valueType: 'date',
    maxLength: 10,
    isFreeText: false,
    description: 'Fecha AAAA-MM-DD en que se identificó la oportunidad (los reportes la usan para ubicarla en su período). Vacío: hoy. Exige la etapa.',
    example: '2024-03-10',
  },
  {
    key: 'result',
    header: 'Resultado',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'WON (ganado), LOST (perdido) o PARTIAL (parcial). Obligatorio si la etapa es cerrada; no se admite con una etapa abierta.',
    example: 'WON',
  },
  {
    key: 'resultReason',
    header: 'Motivo del resultado',
    required: false,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código de un motivo de resultado activo que aplique al resultado (ver hoja Valores válidos). Obligatorio con LOST.',
    example: 'PRECIO',
  },
  {
    key: 'awardedPercent',
    header: 'Porcentaje adjudicado',
    required: false,
    valueType: 'decimal',
    maxLength: null,
    isFreeText: false,
    description: 'Porcentaje de 0 a 100, hasta 2 decimales. Obligatorio con PARTIAL.',
    example: '60',
  },
  {
    key: 'decisionDate',
    header: 'Fecha de decisión',
    required: false,
    valueType: 'date',
    maxLength: 10,
    isFreeText: false,
    description: 'Fecha AAAA-MM-DD del resultado (los reportes de ganadas y perdidas la usan). Obligatoria con resultado.',
    example: '2024-09-30',
  },
  {
    key: 'resultComment',
    header: 'Comentario del resultado',
    required: false,
    valueType: 'text',
    maxLength: 2000,
    isFreeText: true,
    description: 'Comentario del resultado. Exige el resultado.',
    example: 'Motivo en el CRM anterior: Product price',
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

const ENTRA_IDENTITY_COLUMNS: readonly LoadColumn[] = [
  {
    key: 'user',
    header: 'Correo o código de colaborador',
    required: true,
    valueType: 'code',
    maxLength: 320,
    isFreeText: false,
    description:
      'Correo o código de colaborador de un usuario que ya existe en el CRM y no está eliminado (puede estar suspendido). Si contiene @ se busca por correo; si no, por código de colaborador.',
    example: 'colaborador@example.invalid',
  },
  {
    key: 'oid',
    header: 'Object ID (oid)',
    required: true,
    valueType: 'code',
    maxLength: 36,
    isFreeText: false,
    description:
      'Object ID del usuario en Microsoft Entra ID (Azure Portal > Microsoft Entra ID > Usuarios > Id. de objeto): un GUID de 36 caracteres. Se vincula siempre por este identificador, nunca por correo.',
    example: '00000000-0000-0000-0000-000000000001',
  },
];

const USER_COLUMNS: readonly LoadColumn[] = [
  {
    key: 'email',
    header: 'Correo',
    required: true,
    valueType: 'code',
    maxLength: 320,
    isFreeText: false,
    description: 'Correo corporativo del usuario (el de su cuenta de Microsoft). Es único: si ya existe un usuario con ese correo, la fila se omite.',
    example: 'colaborador@example.invalid',
  },
  { key: 'firstName', header: 'Nombre', required: true, valueType: 'text', maxLength: 80, isFreeText: true, description: 'Nombre(s) del usuario.', example: 'Nombre' },
  { key: 'lastName', header: 'Apellido', required: true, valueType: 'text', maxLength: 80, isFreeText: true, description: 'Apellido(s) del usuario.', example: 'Apellido' },
  {
    key: 'employeeCode',
    header: 'Código de colaborador',
    required: true,
    valueType: 'code',
    maxLength: 40,
    isFreeText: false,
    description: 'Código único del colaborador (se guarda en mayúsculas). Obligatorio con un rol comercial.',
    example: 'EC-00001',
  },
  {
    key: 'country',
    header: 'País',
    required: true,
    valueType: 'code',
    maxLength: null,
    isFreeText: false,
    description: 'Código ISO de dos letras de un país activo. Obligatorio con un rol comercial.',
    example: 'EC',
  },
  {
    key: 'role',
    header: 'Rol',
    required: true,
    valueType: 'code',
    maxLength: 60,
    isFreeText: false,
    description: 'Código de un rol activo (p. ej. asesor). Se asigna un solo rol; más roles se dan después desde Administración.',
    example: 'asesor',
  },
  {
    key: 'team',
    header: 'Equipo',
    required: false,
    valueType: 'code',
    maxLength: 40,
    isFreeText: false,
    description: 'Código de un equipo activo (p. ej. CONST, DISTR, INDST). Vacío: sin equipo.',
    example: 'CONST',
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
  'entra-identities': {
    entity: 'entra-identities',
    label: 'vínculos con Entra ID',
    fileBase: 'plantilla-vinculos-entra',
    sheets: [{ id: 'entra-identities', sheetName: 'Vínculos', csvSuffix: '', optionalInCsv: false, columns: ENTRA_IDENTITY_COLUMNS }],
  },
  users: {
    entity: 'users',
    label: 'usuarios',
    fileBase: 'plantilla-usuarios',
    sheets: [{ id: 'users', sheetName: 'Usuarios', csvSuffix: '', optionalInCsv: false, columns: USER_COLUMNS }],
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
  const formatted = column.valueType === 'date' || column.valueType === 'integer' || column.valueType === 'decimal';
  // Un decimal puede llegar como número de la celda: se lee como texto (`kind: 'text'`) y el formato lo valida `sanitizeSheet`.
  const kind = column.valueType === 'text' || column.valueType === 'decimal' ? 'text' : 'code';
  return { key: column.key, maxLength: formatted ? null : column.maxLength, kind, isFreeText: column.isFreeText };
}

/** Nombre del archivo CSV de una hoja a partir del nombre base (`plantilla-productos` + `-familias` → `.csv`). */
export function csvFileName(base: string, sheet: LoadSheet): string {
  return `${base}${sheet.csvSuffix}.csv`;
}
