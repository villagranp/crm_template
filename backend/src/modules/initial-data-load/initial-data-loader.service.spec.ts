import { ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import { writeTextWorkbook } from '@/common/xlsx';
import type { AccessService } from '@/modules/access/access.service';
import type { EntraIdentityLinkService } from '@/modules/access/entra-identity-link.service';
import type { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import type { ProductMastersService } from '@/modules/products/product-masters.service';
import type { ProjectClassificationService } from '@/modules/projects/project-classification.service';
import type { ProjectAccessService } from '@/modules/projects/project-access.service';
import type { ProjectsService } from '@/modules/projects/projects.service';
import type { SafetyMinutesService } from '@/modules/safety-minutes/safety-minutes.service';

import type { LoadFile, LoadSource } from './initial-data-file-reader';
import { ActorRejectedError, describeFailure, InitialDataLoader } from './initial-data-loader.service';
import { ENTITY_DEFINITIONS } from './initial-data-templates';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { InitialDataLookup, LookupEntraIdentity, LookupExistingProject, LookupFamily, LookupProduct, LookupReference, LookupUser } from './ports/initial-data-lookup.port';

const PROJECT_HEADERS = ENTITY_DEFINITIONS.projects.sheets[0]!.columns.map((column) => column.header);
const FAMILY_HEADERS = ENTITY_DEFINITIONS.products.sheets[0]!.columns.map((column) => column.header);
const PRODUCT_HEADERS = ENTITY_DEFINITIONS.products.sheets[1]!.columns.map((column) => column.header);
const MINUTE_HEADERS = ENTITY_DEFINITIONS['safety-minutes'].sheets[0]!.columns.map((column) => column.header);
const IDENTITY_HEADERS = ENTITY_DEFINITIONS['entra-identities'].sheets[0]!.columns.map((column) => column.header);

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const TODAY = '2030-06-15';

function csvFile(headers: readonly string[], rows: string[][]): LoadFile {
  const text = [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  return { fileName: 'datos.csv', buffer: Buffer.from(text, 'utf8') };
}

function row(headers: readonly string[], values: Record<string, string>): string[] {
  return headers.map((header) => values[header] ?? '');
}

const user = (overrides: Partial<LookupUser> = {}): LookupUser => ({
  id: ACTOR_ID,
  email: 'admin@example.invalid',
  employeeCode: null,
  status: 'ACTIVE',
  isDeleted: false,
  ...overrides,
});

interface World {
  users: LookupUser[];
  customers: { id: string; crmCode: string; isDeleted: boolean }[];
  countries: LookupReference[];
  catalogs: Record<string, LookupReference[]>;
  families: LookupFamily[];
  units: LookupReference[];
  products: LookupProduct[];
  projectsByCode: LookupExistingProject[];
  projects: LookupExistingProject[];
  minuteDates: string[];
  entraIdentities: LookupEntraIdentity[];
  /** Obligatorios que añade `crm.campos_obligatorios.project`. */
  requiredProject: string[];
}

function build(world: Partial<World> = {}, adminPermissions: string[] = ['proyectos.crear', 'proyectos.administrar', 'productos.configurar', 'minuto_seguridad.crear', 'usuarios.editar']) {
  const data: World = {
    users: [user()],
    customers: [{ id: CUSTOMER_ID, crmCode: 'CLI-1', isDeleted: false }],
    countries: [{ id: 'country-gt', code: 'GT', isActive: true }],
    catalogs: {
      'crm.tipo_proyecto': [{ id: 'type-edificio', code: 'EDIFICIO', isActive: true }],
      'crm.sector_proyecto': [{ id: 'sector-comercial', code: 'COMERCIAL', isActive: true }],
    },
    families: [],
    units: [{ id: 'unit-ton', code: 'TON', isActive: true }],
    products: [],
    projectsByCode: [],
    projects: [],
    minuteDates: [],
    entraIdentities: [],
    requiredProject: [],
    ...world,
  };
  const pick = <T extends { code: string }>(items: readonly T[], codes: readonly string[]): T[] => items.filter((item) => codes.includes(item.code));
  const lookup: jest.Mocked<InitialDataLookup> = {
    findUsers: jest.fn(async ({ emails, employeeCodes }) => data.users.filter((candidate) => emails.includes(candidate.email) || (candidate.employeeCode !== null && employeeCodes.includes(candidate.employeeCode)))),
    findCustomersByCrmCode: jest.fn(async (codes) => data.customers.filter((customer) => codes.includes(customer.crmCode))),
    findCountriesByIso: jest.fn(async (codes) => pick(data.countries, codes)),
    findCatalogItems: jest.fn(async (key, codes) => pick(data.catalogs[key] ?? [], codes)),
    findFamilies: jest.fn(async (codes) => pick(data.families, codes)),
    findUnits: jest.fn(async (codes) => pick(data.units, codes)),
    findProducts: jest.fn(async (skus) => data.products.filter((existing) => skus.includes(existing.sku))),
    findProjectsByCodes: jest.fn(async (codes) => data.projectsByCode.filter((existing) => codes.includes(existing.code))),
    findProjectsOfCustomers: jest.fn(async (ids) => data.projects.filter((project) => ids.includes(project.customerId))),
    findExistingSafetyMinuteDates: jest.fn(async (dates) => data.minuteDates.filter((date) => dates.includes(date))),
    findEntraIdentities: jest.fn(async ({ subjects, userIds }) => data.entraIdentities.filter((identity) => subjects.includes(identity.subject) || userIds.includes(identity.userId))),
    listTemplateValues: jest.fn(),
  };
  const access = {
    isAdministrador: jest.fn(async (userId: string) => userId === ACTOR_ID),
    getEffectivePermissions: jest.fn(async () => new Set(adminPermissions)),
  };
  const projects = { create: jest.fn(async () => ({ record: { id: 'project-1' } })) };
  const classification = { update: jest.fn(async () => ({})) };
  const projectAccess = { scopes: jest.fn(async () => ({})), isAssignableOwner: jest.fn(async () => true) };
  const customerGuard = { assertUsableCustomer: jest.fn(async () => ({})) };
  const masters = {
    createFamily: jest.fn(async (request: { code: string }) => ({ id: `family-${request.code}` })),
    createProduct: jest.fn(async () => ({ id: 'product-1' })),
  };
  const safetyMinutes = { today: jest.fn(async () => TODAY), create: jest.fn(async () => ({})) };
  const parameters = { get: jest.fn(async () => ({ project: data.requiredProject })) };
  const identityLinks = { link: jest.fn(async (): Promise<{ kind: string }> => ({ kind: 'linked' })) };
  const loader = new InitialDataLoader(
    lookup,
    access as unknown as AccessService,
    projects as unknown as ProjectsService,
    classification as unknown as ProjectClassificationService,
    projectAccess as unknown as ProjectAccessService,
    customerGuard as unknown as CustomerReferenceGuard,
    masters as unknown as ProductMastersService,
    safetyMinutes as unknown as SafetyMinutesService,
    parameters as unknown as ParameterReader,
    identityLinks as unknown as EntraIdentityLinkService,
  );
  return { loader, lookup, access, projects, classification, projectAccess, customerGuard, masters, safetyMinutes, identityLinks };
}

const minutesSource = (rows: Record<string, string>[]): LoadSource => ({
  format: 'CSV',
  files: { 'safety-minutes': csvFile(MINUTE_HEADERS, rows.map((values) => row(MINUTE_HEADERS, values))) },
});

const projectsSource = (rows: Record<string, string>[]): LoadSource => ({
  format: 'CSV',
  files: { projects: csvFile(PROJECT_HEADERS, rows.map((values) => row(PROJECT_HEADERS, values))) },
});

const productsSource = (families: Record<string, string>[], products: Record<string, string>[]): LoadSource => ({
  format: 'CSV',
  files: {
    ...(families.length > 0 ? { families: csvFile(FAMILY_HEADERS, families.map((values) => row(FAMILY_HEADERS, values))) } : {}),
    products: csvFile(PRODUCT_HEADERS, products.map((values) => row(PRODUCT_HEADERS, values))),
  },
});

const identitiesSource = (rows: Record<string, string>[]): LoadSource => ({
  format: 'CSV',
  files: { 'entra-identities': csvFile(IDENTITY_HEADERS, rows.map((values) => row(IDENTITY_HEADERS, values))) },
});

const OID_1 = '00000000-0000-4000-8000-000000000001';
const OID_2 = '00000000-0000-4000-8000-000000000002';
const OID_3 = '00000000-0000-4000-8000-000000000003';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';
const link = (userRef: string, oid: string) => ({ 'Correo o código de colaborador': userRef, 'Object ID (oid)': oid });

const minute = (date: string, message = 'Mensaje de prueba') => ({ 'Fecha de visualización': date, Mensaje: message });
const project = (overrides: Record<string, string> = {}) => ({ 'Nombre del proyecto': 'Torre Ejemplo', 'Código CRM del cliente': 'CLI-1', ...overrides });
const family = (code: string, name = 'Familia') => ({ 'Código de familia': code, Nombre: name });
const product = (sku: string, familyCode = 'FAM', unit = 'TON') => ({ SKU: sku, Descripción: 'Producto', 'Código de familia': familyCode, 'Código de unidad base': unit });

describe('InitialDataLoader · actor', () => {
  it.each([
    ['no existe', { users: [] }, 'ACTOR_NOT_FOUND'],
    ['está suspendido', { users: [user({ status: 'SUSPENDED' })] }, 'ACTOR_NOT_ACTIVE'],
    ['está eliminado', { users: [user({ isDeleted: true })] }, 'ACTOR_NOT_ACTIVE'],
  ])('apply rechaza al actor que %s sin leer el archivo ni escribir', async (_name, world, reason) => {
    const { loader, safetyMinutes, lookup } = build(world);
    await expect(loader.apply('safety-minutes', minutesSource([minute('2030-07-01')]), 'admin@example.invalid')).rejects.toMatchObject({ reason });
    expect(safetyMinutes.create).not.toHaveBeenCalled();
    expect(lookup.findExistingSafetyMinuteDates).not.toHaveBeenCalled();
  });

  it('rechaza al usuario que no es administrador vigente o no tiene el permiso de la entidad', async () => {
    const notAdmin = build();
    notAdmin.access.isAdministrador.mockResolvedValue(false);
    await expect(notAdmin.loader.apply('projects', projectsSource([project()]), 'admin@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_NOT_ADMIN' });

    const lacking = build({}, ['proyectos.crear']);
    await expect(lacking.loader.apply('projects', projectsSource([project()]), 'admin@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_LACKS_PERMISSION' });
    const products = build({}, ['proyectos.crear', 'proyectos.administrar']);
    await expect(products.loader.apply('products', productsSource([], [product('S1')]), 'admin@example.invalid')).rejects.toBeInstanceOf(ActorRejectedError);
  });

  it('el mensaje de rechazo no repite lo escrito en --actor', async () => {
    const { loader } = build({ users: [] });
    let message = '';
    try {
      await loader.apply('safety-minutes', minutesSource([minute('2030-07-01')]), 'secreto@example.invalid');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('secreto');
  });

  it('resuelve al actor por código de colaborador y arma el contexto de auditoría con su id y correo', async () => {
    const { loader } = build({ users: [user({ employeeCode: 'EMP-1' })] });
    const actor = await loader.resolveActor(' EMP-1 ', 'safety-minutes');
    expect(actor.userId).toBe(ACTOR_ID);
    expect(actor.context.audit).toMatchObject({ actorId: ACTOR_ID, actorEmail: 'admin@example.invalid', ipAddress: null });
    expect(actor.context.audit.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('InitialDataLoader · minutos de seguridad', () => {
  it('validar no escribe: reporta por crear, ya existe y fecha pasada', async () => {
    const { loader, safetyMinutes } = build({ minuteDates: ['2030-07-02'] });
    const report = await loader.validate('safety-minutes', minutesSource([minute('2030-07-01'), minute('2030-07-02'), minute('2030-06-14'), minute(TODAY)]));
    expect(report.sheets).toEqual([{ sheet: 'Minutos', read: 4, toCreate: 2, created: 0, exists: 1, existsDifferent: 0, createdWithWarning: 0, errors: 1 }]);
    expect(report.entries).toEqual([
      { sheet: 'Minutos', row: 3, column: 'Fecha de visualización', status: 'EXISTS', code: 'ALREADY_EXISTS', message: expect.any(String) },
      { sheet: 'Minutos', row: 4, column: 'Fecha de visualización', status: 'ERROR', code: 'PAST_DATE', message: expect.any(String) },
    ]);
    expect(report).toMatchObject({ applied: false, errorCount: 1, mode: 'validate' });
    expect(safetyMinutes.create).not.toHaveBeenCalled();
  });

  it('aplicar crea con el servicio, el mensaje normalizado y el actor; omite lo que ya existe', async () => {
    const { loader, safetyMinutes } = build({ minuteDates: ['2030-07-02'] });
    const report = await loader.apply('safety-minutes', minutesSource([minute('2030-07-01', 'Casco puesto'), minute('2030-07-02')]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(report.sheets).toEqual([{ sheet: 'Minutos', read: 2, toCreate: 1, created: 1, exists: 1, existsDifferent: 0, createdWithWarning: 0, errors: 0 }]);
    expect(safetyMinutes.create).toHaveBeenCalledTimes(1);
    expect(safetyMinutes.create).toHaveBeenCalledWith(
      { message: 'Casco puesto', displayDate: '2030-07-01' },
      { userId: ACTOR_ID, audit: expect.objectContaining({ actorId: ACTOR_ID }) },
    );
  });

  it('con un solo error de validación aplicar no crea nada (todo o nada)', async () => {
    const { loader, safetyMinutes } = build();
    const report = await loader.apply('safety-minutes', minutesSource([minute('2030-07-01'), minute('2030-06-01'), minute('no-es-fecha')]), 'admin@example.invalid');
    expect(report.applied).toBe(false);
    expect(report.errorCount).toBe(2);
    expect(report.sheets[0]).toMatchObject({ created: 0, errors: 2, toCreate: 1 });
    expect(safetyMinutes.create).not.toHaveBeenCalled();
  });

  it('un rechazo del servicio en una fila queda como error de esa fila (código y campo) y la carga sigue', async () => {
    const { loader, safetyMinutes } = build();
    safetyMinutes.create.mockRejectedValueOnce(new ResourceConflictError('detalle con datos', [{ field: 'displayDate', issue: 'duplicated' }], 'SAFETY_MINUTE_DUPLICATE'));
    const report = await loader.apply('safety-minutes', minutesSource([minute('2030-07-01'), minute('2030-07-02')]), 'admin@example.invalid');
    expect(report.sheets[0]).toMatchObject({ created: 1, errors: 1 });
    expect(report.entries).toEqual([
      {
        sheet: 'Minutos',
        row: 2,
        column: 'Fecha de visualización',
        status: 'ERROR',
        code: 'SAFETY_MINUTE_DUPLICATE',
        message: 'El sistema rechazó la fila (SAFETY_MINUTE_DUPLICATE en displayDate). Puede ser un conflicto con otra carga o con otro usuario a la vez: vuelva a ejecutar la carga.',
      },
    ]);
    expect(JSON.stringify(report)).not.toContain('detalle con datos');
  });

  it('un archivo con estructura inválida devuelve solo incidencias de archivo y no consulta nada', async () => {
    const { loader, lookup } = build();
    const report = await loader.validate('safety-minutes', { format: 'CSV', files: { 'safety-minutes': csvFile(['Otra'], [['x']]) } });
    expect(report.sheets).toEqual([]);
    expect(report.entries.map((entry) => entry.code)).toEqual(['UNKNOWN_COLUMN', 'MISSING_COLUMN', 'MISSING_COLUMN']);
    expect(lookup.findExistingSafetyMinuteDates).not.toHaveBeenCalled();
  });

  it('validar con --actor comprueba al actor y sigue sin escribir', async () => {
    const { loader, safetyMinutes } = build({ users: [] });
    await expect(loader.validate('safety-minutes', minutesSource([minute('2030-07-01')]), 'nadie@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_NOT_FOUND' });
    expect(safetyMinutes.create).not.toHaveBeenCalled();
  });
});

describe('InitialDataLoader · familias y productos', () => {
  it('una familia definida en el archivo sirve a los productos; las familias se crean antes que los productos', async () => {
    const { loader, masters } = build();
    const order: string[] = [];
    masters.createFamily.mockImplementation(async (request: { code: string }) => {
      order.push(`familia:${request.code}`);
      return { id: `family-${request.code}` };
    });
    masters.createProduct.mockImplementation(async () => {
      order.push('producto');
      return { id: 'p' };
    });
    const report = await loader.apply('products', productsSource([family('fam', 'Aceros')], [product('s1', 'FAM'), product('s2', 'fam')]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(order).toEqual(['familia:FAM', 'producto', 'producto']);
    expect(masters.createFamily).toHaveBeenCalledWith({ code: 'FAM', name: 'Aceros', description: null, sortOrder: 0 }, expect.anything());
    expect(masters.createProduct).toHaveBeenCalledWith({ sku: 'S1', description: 'Producto', familyId: 'family-FAM', baseUnitId: 'unit-ton' }, expect.anything());
    expect(report.sheets.map((sheet) => [sheet.sheet, sheet.created])).toEqual([
      ['Familias', 1],
      ['Productos', 2],
    ]);
  });

  it('usa la familia que ya existe en la base y reporta «ya existe» para la familia y el SKU repetidos', async () => {
    const { loader, masters } = build({
      families: [{ id: 'family-db', code: 'FAM', isActive: true, name: 'Familia', description: null, sortOrder: 0 }],
      products: [{ sku: 'S1', description: 'Producto', familyCode: 'FAM', baseUnitCode: 'TON' }],
    });
    const report = await loader.apply('products', productsSource([family('FAM')], [product('S1'), product('S2')]), 'admin@example.invalid');
    expect(report.sheets).toEqual([
      { sheet: 'Familias', read: 1, toCreate: 0, created: 0, exists: 1, existsDifferent: 0, createdWithWarning: 0, errors: 0 },
      { sheet: 'Productos', read: 2, toCreate: 1, created: 1, exists: 1, existsDifferent: 0, createdWithWarning: 0, errors: 0 },
    ]);
    expect(masters.createFamily).not.toHaveBeenCalled();
    expect(masters.createProduct).toHaveBeenCalledTimes(1);
    expect(masters.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: 'S2', familyId: 'family-db' }), expect.anything());
  });

  it('familia inexistente, familia o unidad inactivas y unidad inexistente son errores de la fila', async () => {
    const { loader, masters } = build({
      families: [{ id: 'f-off', code: 'OFF', isActive: false, name: 'x', description: null, sortOrder: 0 }],
      units: [
        { id: 'u-ton', code: 'TON', isActive: true },
        { id: 'u-off', code: 'OFFU', isActive: false },
      ],
    });
    const report = await loader.apply(
      'products',
      productsSource([], [product('S1', 'NOEXISTE'), product('S2', 'OFF'), product('S3', 'NOEXISTE', 'XX'), product('S4', 'NOEXISTE', 'OFFU')]),
      'admin@example.invalid',
    );
    expect(report.applied).toBe(false);
    expect(report.entries.map((entry) => [entry.row, entry.column, entry.code])).toEqual([
      [2, 'Código de familia', 'UNKNOWN_REFERENCE'],
      [3, 'Código de familia', 'INACTIVE_REFERENCE'],
      [4, 'Código de familia', 'UNKNOWN_REFERENCE'],
      [4, 'Código de unidad base', 'UNKNOWN_REFERENCE'],
      [5, 'Código de familia', 'UNKNOWN_REFERENCE'],
      [5, 'Código de unidad base', 'INACTIVE_REFERENCE'],
    ]);
    expect(masters.createProduct).not.toHaveBeenCalled();
    expect(masters.createFamily).not.toHaveBeenCalled();
  });

  it('si la fila de la familia del archivo tiene un error, el producto no recibe un error de referencia duplicado', async () => {
    const { loader } = build();
    const report = await loader.validate('products', productsSource([family('mal código')], [product('S1', 'mal código')]));
    expect(report.entries.map((entry) => [entry.sheet, entry.code])).toEqual([['Familias', 'INVALID_FORMAT']]);
  });

  it('lee el libro XLSX con las dos hojas', async () => {
    const buffer = await writeTextWorkbook([
      { name: 'Familias', columns: FAMILY_HEADERS.map((header) => ({ header })), rows: [['FAM', 'Aceros', null, '5']] },
      { name: 'Productos', columns: PRODUCT_HEADERS.map((header) => ({ header })), rows: [['S1', 'Producto', 'FAM', 'TON']] },
    ]);
    const { loader, masters } = build();
    const report = await loader.apply('products', { format: 'XLSX', file: { fileName: 'productos.xlsx', buffer } }, 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(masters.createFamily).toHaveBeenCalledWith({ code: 'FAM', name: 'Aceros', description: null, sortOrder: 5 }, expect.anything());
  });
});

describe('InitialDataLoader · proyectos', () => {
  it('crea con el servicio de proyectos (cliente por código CRM, país por ISO, responsable por correo) y clasifica', async () => {
    const owner = user({ id: OWNER_ID, email: 'responsable@example.invalid' });
    const { loader, projects, classification } = build({ users: [user(), owner] });
    const report = await loader.apply(
      'projects',
      projectsSource([
        project({
          País: 'gt',
          Ciudad: 'Ciudad',
          'Fecha estimada de inicio': '2031-01-01',
          'Fecha estimada de fin': '2031-12-01',
          Responsable: 'Responsable@Example.Invalid',
          'Tipo de proyecto': 'edificio',
          Sector: 'comercial',
          'Código de proyecto': 'pry-x',
        }),
        project({ 'Nombre del proyecto': 'Sin clasificar' }),
      ]),
      'admin@example.invalid',
    );
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(report.sheets).toEqual([{ sheet: 'Proyectos', read: 2, toCreate: 2, created: 2, exists: 0, existsDifferent: 0, createdWithWarning: 0, errors: 0 }]);
    expect(projects.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: ACTOR_ID }), {
      name: 'Torre Ejemplo',
      customerId: CUSTOMER_ID,
      countryId: 'country-gt',
      city: 'Ciudad',
      address: null,
      description: null,
      estimatedStartDate: '2031-01-01',
      estimatedEndDate: '2031-12-01',
      estimatedDecisionDate: null,
      ownerId: OWNER_ID,
      code: 'PRY-X',
    });
    expect(projects.create).toHaveBeenNthCalledWith(2, expect.anything(), expect.not.objectContaining({ ownerId: expect.anything(), countryId: expect.anything(), code: expect.anything() }));
    expect(classification.update).toHaveBeenCalledTimes(1);
    expect(classification.update).toHaveBeenCalledWith(expect.anything(), 'project-1', { projectTypeId: 'type-edificio', sectorId: 'sector-comercial', tonnageMode: 'NONE' });
  });

  it('cliente inexistente o eliminado, país, tipo, sector y responsable desconocidos o inactivos son errores de fila', async () => {
    const { loader, projects } = build({
      customers: [
        { id: CUSTOMER_ID, crmCode: 'CLI-1', isDeleted: false },
        { id: 'c2', crmCode: 'CLI-DEL', isDeleted: true },
      ],
      users: [user(), user({ id: OWNER_ID, email: 'baja@example.invalid', employeeCode: 'EMP-9', status: 'SUSPENDED' })],
    });
    const report = await loader.validate(
      'projects',
      projectsSource([
        project({ 'Código CRM del cliente': 'NOEXISTE' }),
        project({ 'Nombre del proyecto': 'B', 'Código CRM del cliente': 'CLI-DEL' }),
        project({ 'Nombre del proyecto': 'C', País: 'ZZ', 'Tipo de proyecto': 'NADA', Sector: 'NADA', Responsable: 'nadie@example.invalid' }),
        project({ 'Nombre del proyecto': 'D', Responsable: 'EMP-9' }),
      ]),
    );
    expect(report.entries.map((entry) => [entry.row, entry.column, entry.code])).toEqual([
      [2, 'Código CRM del cliente', 'UNKNOWN_REFERENCE'],
      [3, 'Código CRM del cliente', 'INACTIVE_REFERENCE'],
      [4, 'País', 'UNKNOWN_REFERENCE'],
      [4, 'Tipo de proyecto', 'UNKNOWN_REFERENCE'],
      [4, 'Sector', 'UNKNOWN_REFERENCE'],
      [4, 'Responsable', 'UNKNOWN_REFERENCE'],
      [5, 'Responsable', 'INACTIVE_REFERENCE'],
    ]);
    expect(report.errorCount).toBe(4);
    expect(projects.create).not.toHaveBeenCalled();
  });

  it('omite como «ya existe» el proyecto con el mismo código o del mismo cliente con el mismo nombre', async () => {
    const { loader, projects } = build({
      projectsByCode: [{ code: 'PRY-1', customerId: CUSTOMER_ID, nameNormalized: 'uno' }],
      projects: [{ code: 'PRY-9', customerId: CUSTOMER_ID, nameNormalized: 'torre nandu' }],
    });
    const report = await loader.apply(
      'projects',
      projectsSource([
        project({ 'Nombre del proyecto': 'Uno', 'Código de proyecto': 'pry-1' }),
        project({ 'Nombre del proyecto': 'Torre Ñandú' }),
        project({ 'Nombre del proyecto': 'Nuevo' }),
      ]),
      'admin@example.invalid',
    );
    expect(report.sheets).toEqual([{ sheet: 'Proyectos', read: 3, toCreate: 1, created: 1, exists: 2, existsDifferent: 0, createdWithWarning: 0, errors: 0 }]);
    expect(report.entries.map((entry) => [entry.row, entry.status, entry.column])).toEqual([
      [2, 'EXISTS', 'Código de proyecto'],
      [3, 'EXISTS', 'Nombre del proyecto'],
    ]);
    expect(projects.create).toHaveBeenCalledTimes(1);
    expect(projects.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'Nuevo' }));
  });

  it('con actor, un cliente que no puede ver o inactivo para él y un responsable no asignable se reportan antes de escribir', async () => {
    const owner = user({ id: OWNER_ID, email: 'responsable@example.invalid' });
    const { loader, projects, customerGuard, projectAccess } = build({ users: [user(), owner] });
    customerGuard.assertUsableCustomer.mockRejectedValue(new ResourceNotFoundError('Customer', CUSTOMER_ID));
    const report = await loader.apply('projects', projectsSource([project()]), 'admin@example.invalid');
    expect(report.entries.map((entry) => [entry.row, entry.column, entry.code])).toEqual([[2, 'Código CRM del cliente', 'CUSTOMER_NOT_USABLE']]);
    expect(projects.create).not.toHaveBeenCalled();

    customerGuard.assertUsableCustomer.mockResolvedValue({});
    projectAccess.isAssignableOwner.mockResolvedValue(false);
    const second = await loader.validate('projects', projectsSource([project({ Responsable: 'responsable@example.invalid' })]), 'admin@example.invalid');
    expect(second.entries.map((entry) => [entry.column, entry.code])).toEqual([['Responsable', 'INVALID_OWNER']]);
    expect(projects.create).not.toHaveBeenCalled();
  });

  it('el responsable que es el propio actor no se consulta como asignable', async () => {
    const { loader, projectAccess, projects } = build();
    const report = await loader.apply('projects', projectsSource([project({ Responsable: 'admin@example.invalid' })]), 'admin@example.invalid');
    expect(report.applied).toBe(true);
    expect(projectAccess.isAssignableOwner).not.toHaveBeenCalled();
    expect(projects.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: ACTOR_ID }));
  });

  it('un rechazo del servicio de proyectos queda en la fila; si falla la clasificación el proyecto queda en una categoría propia, sin doble conteo', async () => {
    const { loader, projects, classification } = build();
    projects.create.mockRejectedValueOnce(new ResourceConflictError('x', [{ field: 'code', issue: 'taken' }], 'PROJECT_CODE_TAKEN'));
    classification.update.mockRejectedValueOnce(new ResourceNotFoundError('Project', 'p'));
    const report = await loader.apply(
      'projects',
      projectsSource([
        project({ 'Nombre del proyecto': 'A', 'Código de proyecto': 'PRY-A', 'Tipo de proyecto': 'EDIFICIO' }),
        project({ 'Nombre del proyecto': 'B', 'Tipo de proyecto': 'EDIFICIO' }),
        project({ 'Nombre del proyecto': 'C' }),
      ]),
      'admin@example.invalid',
    );
    expect(report.sheets[0]).toEqual({ sheet: 'Proyectos', read: 3, toCreate: 3, created: 1, exists: 0, existsDifferent: 0, createdWithWarning: 1, errors: 1 });
    expect(report.entries.map((entry) => [entry.row, entry.status, entry.code, entry.column])).toEqual([
      [2, 'ERROR', 'PROJECT_CODE_TAKEN', 'Código de proyecto'],
      [3, 'WARNING', 'CLASSIFICATION_FAILED', null],
    ]);
    expect(report.entries[0]!.message).toContain('vuelva a ejecutar la carga');
    expect(report.entries[1]!.message).toContain('Clasifíquelo desde la ficha del proyecto');
    expect(classification.update).toHaveBeenCalledTimes(1);
    expect(report.errorCount).toBe(1);
  });

  it('un código ya usado por otro cliente u otro nombre es CODE_CONFLICT y bloquea; con cliente y nombre iguales es «ya existe»', async () => {
    const { loader, projects } = build({
      projectsByCode: [
        { code: 'PRY-A', customerId: 'otro-cliente', nameNormalized: 'torre ejemplo' },
        { code: 'PRY-B', customerId: CUSTOMER_ID, nameNormalized: 'nombre distinto' },
        { code: 'PRY-C', customerId: CUSTOMER_ID, nameNormalized: 'tercero' },
      ],
    });
    const report = await loader.apply(
      'projects',
      projectsSource([
        project({ 'Código de proyecto': 'PRY-A' }),
        project({ 'Nombre del proyecto': 'Segundo', 'Código de proyecto': 'PRY-B' }),
        project({ 'Nombre del proyecto': 'Tercero', 'Código de proyecto': 'PRY-C' }),
        project({ 'Nombre del proyecto': 'Nuevo' }),
      ]),
      'admin@example.invalid',
    );
    expect(report.entries.map((entry) => [entry.row, entry.status, entry.code])).toEqual([
      [2, 'ERROR', 'CODE_CONFLICT'],
      [3, 'ERROR', 'CODE_CONFLICT'],
      [4, 'EXISTS', 'ALREADY_EXISTS'],
    ]);
    expect(report.applied).toBe(false);
    expect(projects.create).not.toHaveBeenCalled();
  });

  it('un proyecto del cliente con el mismo nombre pero otro código se omite con la advertencia EXISTS_DIFFERENT y no bloquea', async () => {
    const { loader, projects } = build({ projects: [{ code: 'PRY-9', customerId: CUSTOMER_ID, nameNormalized: 'torre ejemplo' }] });
    const report = await loader.apply('projects', projectsSource([project({ 'Código de proyecto': 'PRY-NUEVO' }), project({ 'Nombre del proyecto': 'Otro' })]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(report.sheets[0]).toMatchObject({ exists: 0, existsDifferent: 1, created: 1 });
    expect(report.entries).toEqual([expect.objectContaining({ row: 2, status: 'WARNING', code: 'EXISTS_DIFFERENT' })]);
    expect(projects.create).toHaveBeenCalledTimes(1);
  });

  it('anticipa los obligatorios parametrizados: una fila sin ciudad es REQUIRED_FIELD_MISSING y apply no escribe', async () => {
    const { loader, projects } = build({ requiredProject: ['city', 'estimatedStartDate'] });
    const rows = [project({ Ciudad: 'Guatemala', 'Fecha estimada de inicio': '2031-01-01' }), project({ 'Nombre del proyecto': 'Sin ciudad', 'Fecha estimada de inicio': '2031-01-01' })];
    const validated = await loader.validate('projects', projectsSource(rows));
    expect(validated.entries.map((entry) => [entry.row, entry.column, entry.code])).toEqual([[3, 'Ciudad', 'REQUIRED_FIELD_MISSING']]);
    const applied = await loader.apply('projects', projectsSource(rows), 'admin@example.invalid');
    expect(applied).toMatchObject({ applied: false, errorCount: 1 });
    expect(projects.create).not.toHaveBeenCalled();
  });

  it('con tipo o sector parametrizados como obligatorios, clasificar con solo uno es un error de fila; sin clasificar no se exige', async () => {
    const { loader } = build({ requiredProject: ['projectTypeId', 'sectorId'] });
    const report = await loader.validate('projects', projectsSource([project({ Sector: 'COMERCIAL' }), project({ 'Nombre del proyecto': 'Sin clasificar' })]));
    expect(report.entries.map((entry) => [entry.row, entry.column, entry.code])).toEqual([[2, 'Tipo de proyecto', 'REQUIRED_FIELD_MISSING']]);
  });

  it('si la parametrización exige unidad de medida o cantidad al clasificar y la plantilla no las trae, aborta con un mensaje claro', async () => {
    const { loader, projects } = build({ requiredProject: ['measureUnitId'] });
    const report = await loader.apply('projects', projectsSource([project({ 'Tipo de proyecto': 'EDIFICIO' })]), 'admin@example.invalid');
    expect(report.applied).toBe(false);
    expect(report.sheets).toEqual([]);
    expect(report.entries).toEqual([expect.objectContaining({ sheet: null, row: null, status: 'ERROR', code: 'TEMPLATE_CANNOT_SATISFY' })]);
    expect(report.entries[0]!.message).toContain('la plantilla no incluye');
    expect(projects.create).not.toHaveBeenCalled();
    // Sin ninguna fila que clasifique, esa parametrización no estorba.
    expect((await loader.validate('projects', projectsSource([project()]))).errorCount).toBe(0);
  });

  it('familias y productos que ya existen con datos distintos se omiten con EXISTS_DIFFERENT (no bloquea); idénticos, sin advertencia', async () => {
    const { loader, masters } = build({
      families: [
        { id: 'f1', code: 'FAM', isActive: true, name: 'Otro nombre', description: null, sortOrder: 0 },
        { id: 'f2', code: 'IGUAL', isActive: true, name: 'Familia', description: null, sortOrder: 0 },
      ],
      products: [
        { sku: 'S1', description: 'Producto', familyCode: 'FAM', baseUnitCode: 'UND' },
        { sku: 'S2', description: 'Producto', familyCode: 'IGUAL', baseUnitCode: 'TON' },
        { sku: 'S3', description: 'Otra descripción', familyCode: 'IGUAL', baseUnitCode: 'TON' },
        { sku: 'S4', description: 'Producto', familyCode: 'FAM', baseUnitCode: 'TON' },
      ],
      units: [
        { id: 'unit-ton', code: 'TON', isActive: true },
        { id: 'unit-und', code: 'UND', isActive: true },
      ],
    });
    const report = await loader.apply(
      'products',
      productsSource([family('FAM'), family('IGUAL')], [product('S1', 'FAM', 'TON'), product('S2', 'IGUAL'), product('S3', 'IGUAL'), product('S4', 'IGUAL')]),
      'admin@example.invalid',
    );
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(report.sheets).toEqual([
      { sheet: 'Familias', read: 2, toCreate: 0, created: 0, exists: 1, existsDifferent: 1, createdWithWarning: 0, errors: 0 },
      { sheet: 'Productos', read: 4, toCreate: 0, created: 0, exists: 1, existsDifferent: 3, createdWithWarning: 0, errors: 0 },
    ]);
    expect(report.entries.filter((entry) => entry.status === 'WARNING').map((entry) => [entry.sheet, entry.row, entry.code])).toEqual([
      ['Familias', 2, 'EXISTS_DIFFERENT'],
      ['Productos', 2, 'EXISTS_DIFFERENT'],
      ['Productos', 4, 'EXISTS_DIFFERENT'],
      ['Productos', 5, 'EXISTS_DIFFERENT'],
    ]);
    expect(masters.createFamily).not.toHaveBeenCalled();
    expect(masters.createProduct).not.toHaveBeenCalled();
  });
});

describe('describeFailure', () => {
  it('de un error de aplicación toma el código y los nombres de campo, nunca el mensaje', () => {
    expect(describeFailure('products', new ResourceConflictError('SKU secreto-123 repetido', [{ field: 'sku', issue: 'duplicated' }]))).toEqual({
      code: 'RESOURCE_CONFLICT',
      column: 'sku',
      detail: 'RESOURCE_CONFLICT en sku',
    });
  });

  it('de un error inesperado solo conserva el nombre de la clase', () => {
    class BoomError extends Error {}
    const failure = describeFailure('projects', new BoomError('fila con datos personales'));
    expect(failure).toEqual({ code: 'CREATE_FAILED', column: null, detail: 'error inesperado Error' });
    expect(JSON.stringify(failure)).not.toContain('personales');
  });
});

describe('InitialDataLoader · vínculos con Entra ID (ADR-027)', () => {
  const TARGET = 'persona@example.invalid';

  const world = (overrides: Partial<World> = {}): Partial<World> => ({
    users: [user(), user({ id: OWNER_ID, email: TARGET, employeeCode: 'EMP-7' })],
    ...overrides,
  });

  it('validar no escribe: reporta por crear y exige el permiso solo si se indica actor', async () => {
    const { loader, identityLinks } = build(world());
    const report = await loader.validate('entra-identities', identitiesSource([link(TARGET, OID_1)]));
    expect(report.sheets).toEqual([{ sheet: 'Vínculos', read: 1, toCreate: 1, created: 0, exists: 0, existsDifferent: 0, createdWithWarning: 0, errors: 0 }]);
    expect(report).toMatchObject({ applied: false, errorCount: 0 });
    expect(identityLinks.link).not.toHaveBeenCalled();
  });

  it('aplicar vincula por correo o por código de colaborador con el oid en minúsculas y el actor administrador', async () => {
    const { loader, identityLinks } = build(world());
    const report = await loader.apply('entra-identities', identitiesSource([link(TARGET.toUpperCase(), OID_1.toUpperCase()), link('EMP-7', OID_2)]), 'admin@example.invalid');
    // Mismo usuario por correo y por código: ambas filas son error y no se vincula nada.
    expect(report.errorCount).toBe(2);
    expect(report.applied).toBe(false);
    expect(report.entries.map((entry) => entry.code)).toEqual(['DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE']);
    expect(identityLinks.link).not.toHaveBeenCalled();

    const other = build({ users: [user(), user({ id: OWNER_ID, email: TARGET }), user({ id: OTHER_USER_ID, email: 'otra@example.invalid', employeeCode: 'EMP-8' })] });
    const ok = await other.loader.apply('entra-identities', identitiesSource([link(TARGET.toUpperCase(), OID_1.toUpperCase()), link('EMP-8', OID_2)]), 'admin@example.invalid');
    expect(ok).toMatchObject({ applied: true, errorCount: 0 });
    expect(ok.sheets[0]).toMatchObject({ toCreate: 2, created: 2 });
    expect(other.identityLinks.link).toHaveBeenCalledWith(OWNER_ID, OID_1, expect.objectContaining({ actorId: ACTOR_ID }));
    expect(other.identityLinks.link).toHaveBeenCalledWith(OTHER_USER_ID, OID_2, expect.objectContaining({ actorId: ACTOR_ID }));
  });

  it.each([
    ['usuario inexistente', world({ users: [user()] }), link(TARGET, OID_1), 'UNKNOWN_REFERENCE'],
    ['usuario eliminado', world({ users: [user(), user({ id: OWNER_ID, email: TARGET, isDeleted: true })] }), link(TARGET, OID_1), 'INACTIVE_REFERENCE'],
    ['oid con formato inválido', world(), link(TARGET, 'no-es-un-guid'), 'INVALID_FORMAT'],
    ['oid ya vinculado a otro usuario', world({ entraIdentities: [{ userId: OTHER_USER_ID, subject: OID_1 }] }), link(TARGET, OID_1), 'IDENTITY_TAKEN'],
  ])('%s: error de la fila y no se vincula nada', async (_name, overrides, fileRow, code) => {
    const { loader, identityLinks } = build(overrides);
    const report = await loader.apply('entra-identities', identitiesSource([fileRow]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: false, errorCount: 1 });
    expect(report.entries.map((entry) => entry.code)).toEqual([code]);
    expect(identityLinks.link).not.toHaveBeenCalled();
  });

  it('un usuario suspendido sí se puede vincular (vincular no da acceso: lo da el rol)', async () => {
    const { loader, identityLinks } = build(world({ users: [user(), user({ id: OWNER_ID, email: TARGET, status: 'SUSPENDED' })] }));
    const report = await loader.apply('entra-identities', identitiesSource([link(TARGET, OID_1)]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(identityLinks.link).toHaveBeenCalledTimes(1);
  });

  it('el mismo oid ya vinculado al mismo usuario es «ya existe» (idempotente); con otro oid, advertencia EXISTS_DIFFERENT', async () => {
    const { loader, identityLinks } = build(
      world({
        users: [user(), user({ id: OWNER_ID, email: TARGET }), user({ id: OTHER_USER_ID, email: 'otra@example.invalid' })],
        entraIdentities: [
          { userId: OWNER_ID, subject: OID_1 },
          { userId: OTHER_USER_ID, subject: OID_3 },
        ],
      }),
    );
    const report = await loader.apply('entra-identities', identitiesSource([link(TARGET, OID_1), link('otra@example.invalid', OID_2)]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(report.sheets[0]).toMatchObject({ toCreate: 0, created: 0, exists: 1, existsDifferent: 1 });
    expect(report.entries.map((entry) => [entry.row, entry.status, entry.code])).toEqual([
      [2, 'EXISTS', 'ALREADY_EXISTS'],
      [3, 'WARNING', 'EXISTS_DIFFERENT'],
    ]);
    expect(identityLinks.link).not.toHaveBeenCalled();
  });

  it('duplicados dentro del archivo: el mismo oid o el mismo usuario dos veces', async () => {
    const { loader } = build(world({ users: [user(), user({ id: OWNER_ID, email: TARGET }), user({ id: OTHER_USER_ID, email: 'otra@example.invalid' })] }));
    const report = await loader.validate('entra-identities', identitiesSource([link(TARGET, OID_1), link('otra@example.invalid', OID_1), link(TARGET, OID_2)]));
    expect(report.entries.filter((entry) => entry.code === 'DUPLICATE_IN_FILE').map((entry) => [entry.row, entry.column])).toEqual([
      [2, 'Object ID (oid)'],
      [2, 'Correo o código de colaborador'],
      [3, 'Object ID (oid)'],
      [4, 'Correo o código de colaborador'],
    ]);
  });

  it('una condición de carrera (otro vínculo creado entre la lectura y la escritura) queda como error de la fila', async () => {
    const { loader, identityLinks } = build(world());
    identityLinks.link.mockResolvedValueOnce({ kind: 'identity_taken' });
    const report = await loader.apply('entra-identities', identitiesSource([link(TARGET, OID_1)]), 'admin@example.invalid');
    expect(report.errorCount).toBe(1);
    expect(report.entries[0]).toMatchObject({ status: 'ERROR', code: 'IDENTITY_TAKEN' });
  });

  it('el informe nunca incluye correos, códigos ni oid de las celdas', async () => {
    const { loader } = build(world({ entraIdentities: [{ userId: OTHER_USER_ID, subject: OID_1 }] }));
    const report = await loader.validate('entra-identities', identitiesSource([link(TARGET, OID_1), link('desconocido@example.invalid', OID_2)]));
    const text = JSON.stringify(report);
    for (const secret of [TARGET, 'desconocido', OID_1, OID_2]) expect(text).not.toContain(secret);
  });

  it('B8: el informe avisa de las filas que apuntan a usuarios con rol de administrador (cuántas y cuáles), sin bloquear', async () => {
    const adminTarget = user({ id: OTHER_USER_ID, email: 'otra@example.invalid' });
    const { loader, access, identityLinks } = build({ users: [user(), user({ id: OWNER_ID, email: TARGET }), adminTarget] });
    access.isAdministrador.mockImplementation(async (userId: string) => userId === ACTOR_ID || userId === OTHER_USER_ID);

    const report = await loader.apply('entra-identities', identitiesSource([link(TARGET, OID_1), link('otra@example.invalid', OID_2)]), 'admin@example.invalid');
    expect(report).toMatchObject({ applied: true, errorCount: 0 });
    expect(report.entries.map((entry) => [entry.row, entry.status, entry.code])).toEqual([
      [null, 'WARNING', 'ADMINISTRATOR_ROWS'],
      [3, 'WARNING', 'LINKS_TO_ADMINISTRATOR'],
    ]);
    expect(report.entries[0]!.message).toContain('1 fila(s)');
    expect(identityLinks.link).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(report)).not.toContain('otra@example.invalid');
  });

  it('sin filas hacia administradores no añade ningún aviso', async () => {
    const { loader } = build(world());
    const report = await loader.validate('entra-identities', identitiesSource([link(TARGET, OID_1)]));
    expect(report.entries).toEqual([]);
  });

  it('apply exige un actor administrador con usuarios.editar', async () => {
    const lacking = build(world(), ['proyectos.crear']);
    await expect(lacking.loader.apply('entra-identities', identitiesSource([link(TARGET, OID_1)]), 'admin@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_LACKS_PERMISSION' });
    const notAdmin = build(world());
    notAdmin.access.isAdministrador.mockResolvedValue(false);
    await expect(notAdmin.loader.apply('entra-identities', identitiesSource([link(TARGET, OID_1)]), 'admin@example.invalid')).rejects.toMatchObject({ reason: 'ACTOR_NOT_ADMIN' });
  });
});
