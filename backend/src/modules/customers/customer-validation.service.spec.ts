import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type {
  CatalogReferenceCheck,
  CatalogReferenceOptions,
  CatalogReferenceValidator,
} from '@/modules/catalogs/catalog-reference.validator';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { CustomerActorResolver } from './customer-actor.resolver';
import {
  CustomerReferenceCache,
  CUSTOMER_PARAMETERS,
  type CustomerDraft,
  type CustomerValidationOptions,
  CustomerValidationService,
  type ValidationOutcome,
} from './customer-validation.service';
import type {
  CountryLookup,
  CountryRecord,
  CustomerDuplicateCandidate,
  CustomerDuplicateRow,
  CustomersRepository,
  UserLookup,
} from './ports/customers.repository.port';
import type { CustomerDuplicateRuleKey } from './duplicate-rules';
import { makeActor, makeCountry, makeCustomer, makeVisibility, TX } from './testing/customer-fixtures';

const GT = makeCountry();
const SV = makeCountry({ id: 'country-sv', isoCode: 'SV', name: 'El Salvador', phonePrefix: '+503' });
/** País con patrones propios de teléfono y NIT. */
const HN = makeCountry({
  id: 'country-hn',
  isoCode: 'HN',
  name: 'Honduras',
  phonePattern: '\\+504 \\d{4}-\\d{4}',
  taxIdPattern: '\\d{14}',
});
const OLD = makeCountry({ id: 'country-old', isoCode: 'OLD', name: 'País retirado', isActive: false });
const COUNTRIES: readonly CountryRecord[] = [GT, SV, HN, OLD];

interface CatalogItemFixture {
  readonly catalogKey: string;
  readonly id: string;
  readonly code: string;
  readonly isActive: boolean;
}

const CATALOG_ITEMS: readonly CatalogItemFixture[] = [
  { catalogKey: 'crm.estado_cliente', id: 'status-active', code: 'ACTIVO', isActive: true },
  { catalogKey: 'crm.estado_cliente', id: 'status-old', code: 'VIEJO', isActive: false },
  { catalogKey: 'crm.tipo_empresa', id: 'type-sa', code: 'SA', isActive: true },
];

const ELIGIBLE_OWNERS = new Set(['user-1', 'user-2']);
const OWNERS_BY_NATURAL_KEY: Readonly<Record<string, string>> = { 'EMP-01': 'user-1', 'vendedor@example.com': 'user-2' };

/** Válido en pantalla: el responsable por defecto es el actor. */
const VALID_BY_ID: CustomerDraft = { legalName: 'Constructora Peña S.A.', country: 'country-gt', status: 'status-active' };
/** Válido en importación: claves naturales. */
const VALID_BY_KEY: CustomerDraft = { legalName: 'Constructora Peña S.A.', country: 'GT', status: 'ACTIVO', salesOwner: 'EMP-01' };

/** Réplica de la regla real de `CatalogReferenceValidator.check` sobre una tabla en memoria. */
async function fakeCatalogCheck(catalogKey: string, value: string, options: CatalogReferenceOptions): Promise<CatalogReferenceCheck> {
  const item = CATALOG_ITEMS.find(
    (candidate) => candidate.catalogKey === catalogKey && (options.by === 'code' ? candidate.code === value : candidate.id === value),
  );
  if (!item) {
    return { ok: false, issue: { field: options.field, code: 'INVALID_CATALOG_VALUE', message: 'not found', catalogKey, reason: 'NOT_FOUND' } };
  }
  if (!item.isActive && item.id !== options.currentId) {
    return { ok: false, issue: { field: options.field, code: 'INVALID_CATALOG_VALUE', message: 'inactive', catalogKey, reason: 'INACTIVE' } };
  }
  return { ok: true, item: { id: item.id, catalogKey, code: item.code, label: item.code, isActive: item.isActive, metadata: null } };
}

function candidate(overrides: Partial<CustomerDuplicateCandidate> = {}): CustomerDuplicateCandidate {
  return {
    id: 'customer-9',
    crmCode: 'CLI-000009',
    customerCode: null,
    legalName: 'Constructora Peña S.A.',
    country: { isoCode: 'GT', name: 'Guatemala' },
    salesOwnerName: 'Otro Responsable',
    isDeleted: false,
    isInScope: true,
    ...overrides,
  };
}

function row(rules: readonly CustomerDuplicateRuleKey[], overrides: Partial<CustomerDuplicateCandidate> = {}): CustomerDuplicateRow {
  return { rules, candidate: candidate(overrides) };
}

function issueKeys(outcome: ValidationOutcome): string[] {
  return outcome.errors.map((issue) => `${issue.field}:${issue.code}`);
}

describe('CustomerValidationService', () => {
  let params: Record<string, unknown>;
  let repository: {
    findCountry: jest.Mock;
    findEligibleSalesOwner: jest.Mock;
    findCustomerCodeHolder: jest.Mock;
    findDuplicateCandidates: jest.Mock;
  };
  let catalogs: { check: jest.Mock };
  let parameters: { get: jest.Mock };
  let actors: { visibility: jest.Mock; assignableSalesOwners: jest.Mock };
  let logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
  let service: CustomerValidationService;

  const actor = makeActor(['clientes.ver', 'clientes.crear']);
  const byId = (overrides: Partial<CustomerValidationOptions> = {}): CustomerValidationOptions => ({ mode: 'BY_ID', actor, ...overrides });
  const byKey = (overrides: Partial<CustomerValidationOptions> = {}): CustomerValidationOptions => ({
    mode: 'BY_NATURAL_KEY',
    actor,
    ...overrides,
  });

  beforeEach(() => {
    params = {
      [CUSTOMER_PARAMETERS.codeUniqueness]: 'PAIS',
      [CUSTOMER_PARAMETERS.duplicateRules]: {},
      [CUSTOMER_PARAMETERS.requiredFields]: {},
      [CUSTOMER_PARAMETERS.defaultValues]: {},
    };
    repository = {
      findCountry: jest.fn(async (lookup: CountryLookup) =>
        COUNTRIES.find((country) => (lookup.by === 'id' ? country.id : country.isoCode) === lookup.value) ?? null,
      ),
      findEligibleSalesOwner: jest.fn(async (lookup: UserLookup) =>
        lookup.by === 'id' ? (ELIGIBLE_OWNERS.has(lookup.value) ? lookup.value : null) : (OWNERS_BY_NATURAL_KEY[lookup.value] ?? null),
      ),
      findCustomerCodeHolder: jest.fn().mockResolvedValue(null),
      findDuplicateCandidates: jest.fn().mockResolvedValue([]),
    };
    catalogs = { check: jest.fn(fakeCatalogCheck) };
    parameters = { get: jest.fn(async (key: string) => params[key]) };
    actors = {
      visibility: jest.fn().mockResolvedValue(makeVisibility()),
      assignableSalesOwners: jest.fn().mockResolvedValue({ kind: 'FILTERED', userIds: ['user-1'], countryIds: [] }),
    };
    logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
    service = new CustomerValidationService(
      repository as unknown as CustomersRepository,
      catalogs as unknown as CatalogReferenceValidator,
      parameters as unknown as ParameterReader,
      actors as unknown as CustomerActorResolver,
      logger as unknown as AppLogger,
    );
  });

  describe('alta válida', () => {
    it('devuelve los valores normalizados con el actor como responsable por defecto', async () => {
      const outcome = await service.validate(
        { ...VALID_BY_ID, customerCode: ' ab-12 ', taxId: '12.345-6 k', email: ' Ventas@Example.com ' },
        byId(),
      );

      expect(outcome.errors).toEqual([]);
      expect(outcome.codeConflict).toBeNull();
      expect(outcome.normalized).toMatchObject({
        customerCode: 'ab-12',
        customerCodeNormalized: 'AB12',
        legalName: 'Constructora Peña S.A.',
        legalNameNormalized: 'constructora pena s.a.',
        taxId: '12.345-6 k',
        taxIdNormalized: '123456K',
        countryId: 'country-gt',
        email: 'Ventas@Example.com',
        statusId: 'status-active',
        salesOwnerId: 'user-1',
        companyTypeId: null,
        ratingId: null,
      });
    });

    it('propaga la transacción del llamador a las consultas', async () => {
      await service.validate({ ...VALID_BY_ID, customerCode: 'AB12' }, byId({ tx: TX }));

      expect(repository.findCountry).toHaveBeenCalledWith({ by: 'id', value: 'country-gt' }, TX);
      expect(repository.findEligibleSalesOwner).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'clientes.ver', TX);
      expect(catalogs.check).toHaveBeenCalledWith('crm.estado_cliente', 'status-active', expect.objectContaining({ tx: TX }));
      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith('AB12', expect.anything(), expect.anything(), TX);
    });
  });

  describe('regla de fórmulas (RN-02.32)', () => {
    it.each([
      ['=SUM(A1)', 'igual'],
      ['   =1+1', 'igual tras espacios iniciales'],
      ['@cmd', 'arroba'],
      ['\tvalor', 'tabulador'],
      ['\rvalor', 'retorno de carro'],
    ])('rechaza %j (%s) en cada campo de texto libre', async (raw) => {
      const outcome = await service.validate(
        { ...VALID_BY_ID, legalName: raw, tradeName: raw, city: raw, address: raw },
        byId(),
      );

      expect(issueKeys(outcome)).toEqual(
        expect.arrayContaining([
          'legalName:FORMULA_NOT_ALLOWED',
          'tradeName:FORMULA_NOT_ALLOWED',
          'city:FORMULA_NOT_ALLOWED',
          'address:FORMULA_NOT_ALLOWED',
        ]),
      );
      expect(outcome.normalized).toBeNull();
    });

    it('admite textos que empiezan por + o -', async () => {
      const outcome = await service.validate({ ...VALID_BY_ID, tradeName: '+ Comercial', address: '- zona 10' }, byId());

      expect(outcome.errors).toEqual([]);
    });

    it('en la edición solo mira los campos enviados', async () => {
      const existing = makeCustomer({ legalName: '=valor heredado', city: '@ciudad' });

      const outcome = await service.validate({ tradeName: 'Nuevo comercial' }, byId({ existing }));

      expect(outcome.errors).toEqual([]);
    });
  });

  describe('formato en modo claves naturales (importación)', () => {
    it('devuelve VALIDATION_FAILED con maxLength cuando se supera la longitud', async () => {
      const outcome = await service.validate({ ...VALID_BY_KEY, legalName: 'a'.repeat(201), phone: '1'.repeat(41) }, byKey());

      expect(outcome.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'legalName', code: 'VALIDATION_FAILED', maxLength: 200 }),
          expect.objectContaining({ field: 'phone', code: 'VALIDATION_FAILED', maxLength: 40 }),
        ]),
      );
    });

    it('acepta el límite exacto, cuenta caracteres unicode y recorta antes de medir', async () => {
      for (const legalName of ['a'.repeat(200), '😀'.repeat(200), `  ${'b'.repeat(200)}  `]) {
        const outcome = await service.validate({ ...VALID_BY_KEY, legalName }, byKey());
        expect(outcome.errors).toEqual([]);
      }
    });

    it('rechaza un correo mal formado con VALIDATION_FAILED', async () => {
      const outcome = await service.validate({ ...VALID_BY_KEY, email: 'no-es-correo' }, byKey());

      expect(issueKeys(outcome)).toEqual(['email:VALIDATION_FAILED']);
    });
  });

  describe('obligatorios (RN-02.4)', () => {
    it('exige los campos base en el alta', async () => {
      const outcome = await service.validate({ country: 'country-gt', status: 'status-active' }, byId());

      expect(issueKeys(outcome)).toEqual(['legalName:REQUIRED_FIELD_MISSING']);
    });

    it('trata un texto en blanco como ausente', async () => {
      const outcome = await service.validate({ ...VALID_BY_ID, legalName: '   ' }, byId());

      expect(issueKeys(outcome)).toEqual(['legalName:REQUIRED_FIELD_MISSING']);
    });

    it('suma los del parámetro e ignora con advertencia un campo que no existe en la entrada', async () => {
      params[CUSTOMER_PARAMETERS.requiredFields] = { customer: ['taxId', 'primaryContactId'] };

      const outcome = await service.validate(VALID_BY_ID, byId());

      expect(issueKeys(outcome)).toEqual(['taxId:REQUIRED_FIELD_MISSING']);
      expect(logger.warn).toHaveBeenCalledWith('customer_required_field_ignored', {
        parameter: CUSTOMER_PARAMETERS.requiredFields,
        field: 'primaryContactId',
      });
      await expect(service.requiredFieldNames()).resolves.toEqual(['legalName', 'countryId', 'statusId', 'salesOwnerId', 'taxId']);
    });

    it('en la edición solo falla si se envía vacío un obligatorio', async () => {
      const existing = makeCustomer();

      await expect(service.validate({ city: 'Mixco' }, byId({ existing }))).resolves.toMatchObject({ errors: [] });
      const cleared = await service.validate({ legalName: '' }, byId({ existing }));
      expect(issueKeys(cleared)).toEqual(['legalName:REQUIRED_FIELD_MISSING']);
    });
  });

  describe('valores por defecto (crm.valores_por_defecto)', () => {
    it('aplica el defecto por id en pantalla antes de comprobar obligatorios', async () => {
      params[CUSTOMER_PARAMETERS.defaultValues] = { 'customer.statusId': 'ACTIVO', 'customer.companyTypeId': 'SA' };

      const outcome = await service.validate({ legalName: 'Cliente', country: 'country-gt' }, byId());

      expect(outcome.errors).toEqual([]);
      expect(outcome.normalized).toMatchObject({ statusId: 'status-active', companyTypeId: 'type-sa' });
      expect(catalogs.check).toHaveBeenCalledWith('crm.estado_cliente', 'ACTIVO', expect.objectContaining({ by: 'code', requireActive: true }));
    });

    it('aplica el defecto por código en importación', async () => {
      params[CUSTOMER_PARAMETERS.defaultValues] = { 'customer.statusId': 'ACTIVO' };

      const outcome = await service.validate({ legalName: 'Cliente', country: 'GT', salesOwner: 'EMP-01' }, byKey());

      expect(outcome.errors).toEqual([]);
      expect(outcome.normalized?.statusId).toBe('status-active');
      expect(catalogs.check).toHaveBeenLastCalledWith('crm.estado_cliente', 'ACTIVO', expect.objectContaining({ by: 'code' }));
    });

    it('ignora con advertencia un defecto inactivo y el obligatorio sigue faltando', async () => {
      params[CUSTOMER_PARAMETERS.defaultValues] = { 'customer.statusId': 'VIEJO' };

      const outcome = await service.validate({ legalName: 'Cliente', country: 'country-gt' }, byId());

      expect(issueKeys(outcome)).toEqual(['statusId:REQUIRED_FIELD_MISSING']);
      expect(logger.warn).toHaveBeenCalledWith('customer_default_value_ignored', {
        parameter: CUSTOMER_PARAMETERS.defaultValues,
        key: 'customer.statusId',
        reason: 'INACTIVE',
      });
    });

    it('no los aplica en la edición', async () => {
      params[CUSTOMER_PARAMETERS.defaultValues] = { 'customer.companyTypeId': 'SA' };

      const outcome = await service.validate({ city: 'Mixco' }, byId({ existing: makeCustomer() }));

      expect(outcome.normalized?.companyTypeId).toBeNull();
      expect(parameters.get).not.toHaveBeenCalledWith(CUSTOMER_PARAMETERS.defaultValues);
    });
  });

  describe('país (RN-02.8)', () => {
    it.each([
      ['inexistente', 'country-zz'],
      ['inactivo', 'country-old'],
    ])('rechaza en el alta un país %s con INVALID_COUNTRY', async (_case, country) => {
      const outcome = await service.validate({ ...VALID_BY_ID, country }, byId());

      expect(issueKeys(outcome)).toEqual(['countryId:INVALID_COUNTRY']);
    });

    it('resuelve por isoCode en importación', async () => {
      const outcome = await service.validate(VALID_BY_KEY, byKey());

      expect(repository.findCountry).toHaveBeenCalledWith({ by: 'isoCode', value: 'GT' }, undefined);
      expect(outcome.normalized?.countryId).toBe('country-gt');
    });

    it('rechaza cambiar a un país inactivo', async () => {
      const outcome = await service.validate({ country: 'country-old' }, byId({ existing: makeCustomer() }));

      expect(issueKeys(outcome)).toEqual(['countryId:INVALID_COUNTRY']);
    });

    it('conserva el país ya asociado aunque se haya desactivado', async () => {
      const existing = makeCustomer({ country: OLD });

      await expect(service.validate({ city: 'Mixco' }, byId({ existing }))).resolves.toMatchObject({ errors: [] });
      const resent = await service.validate({ country: 'country-old', city: 'Mixco' }, byId({ existing }));
      expect(resent.errors).toEqual([]);
      expect(resent.normalized?.countryId).toBe('country-old');
    });
  });

  describe('teléfono (RN-02.6)', () => {
    it.each([
      ['2222-3333', 'country-gt', true],
      ['+502 (2222) 3333', 'country-gt', true],
      ['abc', 'country-gt', false],
      ['123456', 'country-gt', false],
      ['+504 2222-3333', 'country-hn', true],
      ['2222-3333', 'country-hn', false],
    ])('%j en %s → válido=%s', async (phone, country, valid) => {
      const outcome = await service.validate({ ...VALID_BY_ID, country, phone }, byId());

      expect(issueKeys(outcome)).toEqual(valid ? [] : ['phone:INVALID_PHONE_FORMAT']);
    });

    it('revalida el teléfono guardado al cambiar a un país con patrón', async () => {
      const existing = makeCustomer({ phone: '2222 3333', taxId: null, taxIdNormalized: null });

      const outcome = await service.validate({ country: 'country-hn' }, byId({ existing }));

      expect(issueKeys(outcome)).toEqual(['phone:INVALID_PHONE_FORMAT']);
    });

    it('no revalida el teléfono guardado si no se envía ni cambia el país', async () => {
      const existing = makeCustomer({ country: HN, phone: '2222 3333', taxId: null, taxIdNormalized: null });

      const outcome = await service.validate({ city: 'Tegucigalpa' }, byId({ existing }));

      expect(outcome.errors).toEqual([]);
    });
  });

  describe('NIT (RN-02.7)', () => {
    it.each([
      ['12.345-6 k', 'country-gt', true],
      ['12', 'country-gt', false],
      ['1234-5678-9012-34', 'country-hn', true],
      ['123', 'country-hn', false],
    ])('%j en %s se valida normalizado → válido=%s', async (taxId, country, valid) => {
      const outcome = await service.validate({ ...VALID_BY_ID, country, taxId }, byId());

      expect(issueKeys(outcome)).toEqual(valid ? [] : ['taxId:INVALID_TAX_ID_FORMAT']);
    });

    it('revalida el NIT guardado al cambiar de país', async () => {
      const existing = makeCustomer({ phone: null, taxId: '1234567', taxIdNormalized: '1234567' });

      const outcome = await service.validate({ country: 'country-hn' }, byId({ existing }));

      expect(issueKeys(outcome)).toEqual(['taxId:INVALID_TAX_ID_FORMAT']);
    });
  });

  describe('catálogos (RN-02.9)', () => {
    it('devuelve la incidencia de CatalogReferenceValidator.check tal cual', async () => {
      const outcome = await service.validate({ ...VALID_BY_ID, status: 'status-nope', companyType: 'status-active' }, byId());

      expect(outcome.errors).toEqual([
        expect.objectContaining({ field: 'companyTypeId', code: 'INVALID_CATALOG_VALUE', catalogKey: 'crm.tipo_empresa', reason: 'NOT_FOUND' }),
        expect.objectContaining({ field: 'statusId', code: 'INVALID_CATALOG_VALUE', catalogKey: 'crm.estado_cliente', reason: 'NOT_FOUND' }),
      ]);
      expect(catalogs.check).toHaveBeenCalledWith(
        'crm.estado_cliente',
        'status-nope',
        expect.objectContaining({ field: 'statusId', by: 'id', requireActive: true, currentId: null }),
      );
    });

    it('rechaza en el alta un elemento inactivo', async () => {
      const outcome = await service.validate({ ...VALID_BY_ID, status: 'status-old' }, byId());

      expect(outcome.errors).toEqual([expect.objectContaining({ field: 'statusId', reason: 'INACTIVE' })]);
    });

    it('en la edición conserva el valor actual sin consultar el catálogo', async () => {
      const existing = makeCustomer({
        status: { id: 'status-old', code: 'VIEJO', label: 'Viejo', isActive: false, countsAsActive: false },
      });

      const outcome = await service.validate({ status: 'status-old', city: 'Mixco' }, byId({ existing }));

      expect(outcome.errors).toEqual([]);
      expect(outcome.normalized?.statusId).toBe('status-old');
      expect(catalogs.check).not.toHaveBeenCalled();
    });
  });

  describe('responsable (RN-02.10, D-02.2)', () => {
    it('rechaza un responsable no elegible con INVALID_SALES_OWNER', async () => {
      const outcome = await service.validate({ ...VALID_BY_ID, salesOwner: 'user-9' }, byId());

      expect(issueKeys(outcome)).toEqual(['salesOwnerId:INVALID_SALES_OWNER']);
    });

    it('en importación busca por clave natural dentro de lo asignable', async () => {
      const outcome = await service.validate(VALID_BY_KEY, byKey());

      expect(repository.findEligibleSalesOwner).toHaveBeenCalledWith(
        { by: 'naturalKey', value: 'EMP-01' },
        { kind: 'FILTERED', userIds: ['user-1'], countryIds: [] },
        'clientes.ver',
        undefined,
      );
      expect(outcome.normalized?.salesOwnerId).toBe('user-1');
    });

    it('en importación sin responsable asigna al actor buscándolo por id, no por clave natural (06 RN-06.12)', async () => {
      const outcome = await service.validate({ ...VALID_BY_KEY, salesOwner: '  ' }, byKey());

      expect(repository.findEligibleSalesOwner).toHaveBeenCalledWith({ by: 'id', value: 'user-1' }, expect.anything(), 'clientes.ver', undefined);
      expect(outcome.errors).toEqual([]);
      expect(outcome.normalized?.salesOwnerId).toBe('user-1');
    });

    it('en la edición no revalida el responsable actual', async () => {
      const outcome = await service.validate({ salesOwner: 'user-1' }, byId({ existing: makeCustomer() }));

      expect(outcome.errors).toEqual([]);
      expect(repository.findEligibleSalesOwner).not.toHaveBeenCalled();
    });
  });

  describe('todas las incidencias (RN-02.12)', () => {
    it('devuelve todas, ordenadas por gravedad, y no evalúa unicidad ni duplicados', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR' };

      const outcome = await service.validate(
        {
          customerCode: 'AB12',
          tradeName: '=x',
          city: 'c'.repeat(121),
          email: 'mal',
          country: 'country-old',
          status: 'status-nope',
          salesOwner: 'user-9',
        },
        byId(),
      );

      expect(issueKeys(outcome)).toEqual([
        'city:VALIDATION_FAILED',
        'email:VALIDATION_FAILED',
        'tradeName:FORMULA_NOT_ALLOWED',
        'legalName:REQUIRED_FIELD_MISSING',
        'countryId:INVALID_COUNTRY',
        'statusId:INVALID_CATALOG_VALUE',
        'salesOwnerId:INVALID_SALES_OWNER',
      ]);
      expect(outcome).toMatchObject({ normalized: null, codeConflict: null, duplicates: [], blockingDuplicates: [] });
      expect(actors.visibility).not.toHaveBeenCalled();
      expect(repository.findCustomerCodeHolder).not.toHaveBeenCalled();
      expect(repository.findDuplicateCandidates).not.toHaveBeenCalled();
    });

    it('AC-02.25: el mismo borrador inválido da los mismos códigos en pantalla e importación', async () => {
      const shared: CustomerDraft = { legalName: '@x', tradeName: 'Peña', taxId: '12', phone: 'abc' };

      const screen = await service.validate(
        { ...shared, country: 'country-gt', status: 'status-old', salesOwner: 'user-9' },
        byId(),
      );
      const file = await service.validate({ ...shared, country: 'GT', status: 'VIEJO', salesOwner: 'EMP-99' }, byKey());

      expect(issueKeys(screen)).toEqual([
        'legalName:FORMULA_NOT_ALLOWED',
        'phone:INVALID_PHONE_FORMAT',
        'taxId:INVALID_TAX_ID_FORMAT',
        'statusId:INVALID_CATALOG_VALUE',
        'salesOwnerId:INVALID_SALES_OWNER',
      ]);
      expect(issueKeys(file)).toEqual(issueKeys(screen));
    });
  });

  describe('unicidad del código (RN-02.13)', () => {
    it('con PAIS busca en el país del cliente y oculta el id si no está en su alcance', async () => {
      repository.findCustomerCodeHolder.mockResolvedValue({ id: 'customer-9', crmCode: 'CLI-000009', isDeleted: true, isInScope: false });

      const outcome = await service.validate({ ...VALID_BY_ID, customerCode: ' ab-12 ' }, byId());

      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith(
        'AB12',
        { countryId: 'country-gt', excludeCustomerId: null },
        makeVisibility(),
        undefined,
      );
      expect(outcome.codeConflict).toEqual({ customerId: null, crmCode: 'CLI-000009', isDeleted: true });
    });

    it('con GLOBAL busca en todos los países', async () => {
      params[CUSTOMER_PARAMETERS.codeUniqueness] = 'GLOBAL';
      repository.findCustomerCodeHolder.mockResolvedValue({ id: 'customer-9', crmCode: 'CLI-000009', isDeleted: false, isInScope: true });

      const outcome = await service.validate({ ...VALID_BY_ID, customerCode: 'AB12' }, byId());

      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith('AB12', { countryId: null, excludeCustomerId: null }, expect.anything(), undefined);
      expect(outcome.codeConflict).toEqual({ customerId: 'customer-9', crmCode: 'CLI-000009', isDeleted: false });
    });

    it('en la edición no comprueba si el código normalizado y el país no cambian', async () => {
      const outcome = await service.validate({ customerCode: 'ab 12' }, byId({ existing: makeCustomer() }));

      expect(outcome.codeConflict).toBeNull();
      expect(repository.findCustomerCodeHolder).not.toHaveBeenCalled();
    });

    it('en la edición comprueba el mismo código si cambia el país, excluyendo al propio cliente', async () => {
      await service.validate({ customerCode: 'AB-12', country: 'country-sv' }, byId({ existing: makeCustomer() }));

      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith(
        'AB12',
        { countryId: 'country-sv', excludeCustomerId: 'customer-1' },
        expect.anything(),
        undefined,
      );
    });
  });

  describe('duplicados blandos (RN-02.14)', () => {
    it('en el alta busca todas las reglas activas con valor, en el mismo país', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = {
        razonSocialNormalizada: 'AVISAR',
        nombreComercialNormalizado: 'AVISAR',
        correo: 'AVISAR',
        telefono: 'AVISAR',
        nit: 'AVISAR',
      };

      await service.validate(
        { ...VALID_BY_ID, tradeName: 'Peña  Hnos', email: 'Ventas@Example.com', phone: '+502 2222-3333', taxId: '12.345-6 k' },
        byId(),
      );

      expect(repository.findDuplicateCandidates).toHaveBeenCalledWith(
        {
          countryId: 'country-gt',
          excludeCustomerId: null,
          razonSocialNormalizada: 'constructora pena s.a.',
          nombreComercialNormalizado: 'pena hnos',
          correo: 'ventas@example.com',
          telefono: '50222223333',
          nit: '123456K',
        },
        makeVisibility(),
        undefined,
      );
    });

    it('omite las reglas en NO y las claves sin valor', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR', correo: 'AVISAR', telefono: 'NO' };

      await service.validate({ ...VALID_BY_ID, phone: '2222 3333' }, byId());

      expect(repository.findDuplicateCandidates).toHaveBeenCalledWith(
        { countryId: 'country-gt', excludeCustomerId: null, razonSocialNormalizada: 'constructora pena s.a.' },
        expect.anything(),
        undefined,
      );
    });

    it('separa avisos (AVISAR) de bloqueos (BLOQUEAR) con su motivo', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR', correo: 'BLOQUEAR' };
      repository.findDuplicateCandidates.mockResolvedValue([row(['razonSocialNormalizada', 'correo'])]);

      const outcome = await service.validate({ ...VALID_BY_ID, email: 'ventas@example.com' }, byId());

      expect(outcome.duplicates).toEqual([
        {
          rule: 'razonSocialNormalizada',
          reason: 'LEGAL_NAME',
          candidate: {
            id: 'customer-9',
            crmCode: 'CLI-000009',
            customerCode: null,
            legalName: 'Constructora Peña S.A.',
            country: { isoCode: 'GT', name: 'Guatemala' },
            salesOwnerName: 'Otro Responsable',
            isVisible: true,
            isDeleted: false,
          },
        },
      ]);
      expect(outcome.blockingDuplicates).toEqual([expect.objectContaining({ rule: 'correo', reason: 'EMAIL' })]);
    });

    it('descarta coincidencias de reglas que no se buscaron', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR' };
      repository.findDuplicateCandidates.mockResolvedValue([row(['telefono'])]);

      const outcome = await service.validate(VALID_BY_ID, byId());

      expect(outcome.duplicates).toEqual([]);
    });

    it('oculta el id de un candidato fuera de alcance o eliminado sin clientes.eliminar', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR' };
      repository.findDuplicateCandidates.mockResolvedValue([
        row(['razonSocialNormalizada'], { id: 'customer-out', isInScope: false }),
        row(['razonSocialNormalizada'], { id: 'customer-del', isDeleted: true }),
      ]);

      const outcome = await service.validate(VALID_BY_ID, byId());

      expect(outcome.duplicates.map((match) => match.candidate)).toEqual([
        expect.objectContaining({ id: null, isVisible: false, isDeleted: false }),
        expect.objectContaining({ id: null, isVisible: false, isDeleted: true }),
      ]);
    });

    it('muestra el id de un candidato eliminado en alcance a quien tiene clientes.eliminar', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR' };
      repository.findDuplicateCandidates.mockResolvedValue([row(['razonSocialNormalizada'], { id: 'customer-del', isDeleted: true })]);

      const outcome = await service.validate(VALID_BY_ID, byId({ actor: makeActor(['clientes.crear', 'clientes.eliminar']) }));

      expect(outcome.duplicates[0]?.candidate).toMatchObject({ id: 'customer-del', isVisible: true, isDeleted: true });
    });

    it('trata nit en BLOQUEAR como AVISAR y lo registra', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { nit: 'BLOQUEAR' };
      repository.findDuplicateCandidates.mockResolvedValue([row(['nit'])]);

      const outcome = await service.validate({ ...VALID_BY_ID, taxId: '1234567' }, byId());

      expect(outcome.blockingDuplicates).toEqual([]);
      expect(outcome.duplicates).toEqual([expect.objectContaining({ rule: 'nit', reason: 'TAX_ID' })]);
      expect(logger.warn).toHaveBeenCalledWith('customer_duplicate_rule_ignored', {
        parameter: CUSTOMER_PARAMETERS.duplicateRules,
        key: 'nit',
        reason: 'ACTION_NOT_ALLOWED',
      });
    });

    describe('en la edición', () => {
      beforeEach(() => {
        params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR', correo: 'AVISAR', telefono: 'AVISAR' };
      });

      it('solo busca las claves cuyo valor normalizado cambia', async () => {
        await service.validate({ email: 'otro@example.com' }, byId({ existing: makeCustomer() }));

        expect(repository.findDuplicateCandidates).toHaveBeenCalledWith(
          { countryId: 'country-gt', excludeCustomerId: 'customer-1', correo: 'otro@example.com' },
          expect.anything(),
          undefined,
        );
      });

      it('no busca nada si el valor normalizado no cambia', async () => {
        await service.validate({ legalName: 'CONSTRUCTORA  PEÑA S.A.' }, byId({ existing: makeCustomer() }));

        expect(repository.findDuplicateCandidates).not.toHaveBeenCalled();
      });

      it('busca todas las reglas si cambia el país', async () => {
        await service.validate({ country: 'country-sv' }, byId({ existing: makeCustomer() }));

        expect(repository.findDuplicateCandidates).toHaveBeenCalledWith(
          {
            countryId: 'country-sv',
            excludeCustomerId: 'customer-1',
            razonSocialNormalizada: 'constructora pena s.a.',
            correo: 'ventas@example.com',
            telefono: '22223333',
          },
          expect.anything(),
          undefined,
        );
      });
    });
  });

  describe('memoria de referencias (importación, 06 PF-06.44)', () => {
    it('lee cada país, catálogo y responsable una vez por lote; con tx la ignora', async () => {
      const referenceCache = new CustomerReferenceCache();
      await service.validate(VALID_BY_KEY, byKey({ referenceCache }));
      await service.validate({ ...VALID_BY_KEY, legalName: 'Otra S.A.' }, byKey({ referenceCache }));

      expect(repository.findCountry).toHaveBeenCalledTimes(1);
      expect(repository.findEligibleSalesOwner).toHaveBeenCalledTimes(1);
      const catalogCalls = catalogs.check.mock.calls.length;

      await service.validate(VALID_BY_KEY, byKey({ referenceCache, tx: TX }));
      expect(repository.findCountry).toHaveBeenCalledTimes(2);
      expect(repository.findCountry).toHaveBeenLastCalledWith(expect.anything(), TX);
      expect(catalogs.check.mock.calls.length).toBeGreaterThan(catalogCalls);
    });
  });

  describe('duplicateKeys (importación)', () => {
    it('con PAIS compone país y código, y omite el NIT si la regla no avisa', async () => {
      await expect(service.duplicateKeys({ country: ' gt ', customerCode: 'ab-12', taxId: '1234567' })).resolves.toEqual({
        customerCode: 'GT|AB12',
        taxId: null,
        legalName: null,
      });
    });

    it('con GLOBAL usa solo el código y con nit en AVISAR incluye el NIT normalizado', async () => {
      params[CUSTOMER_PARAMETERS.codeUniqueness] = 'GLOBAL';
      params[CUSTOMER_PARAMETERS.duplicateRules] = { nit: 'AVISAR' };

      await expect(service.duplicateKeys({ country: 'GT', customerCode: 'AB 12', taxId: '12.345-6 k' })).resolves.toEqual({
        customerCode: 'AB12',
        taxId: 'GT|123456K',
        legalName: null,
      });
    });

    it('incluye la razón social normalizada por país si su regla no vale NO, y acepta el contexto de prepare()', async () => {
      params[CUSTOMER_PARAMETERS.duplicateRules] = { razonSocialNormalizada: 'AVISAR' };
      await expect(service.duplicateKeys({ country: 'GT', legalName: ' Ácme,  S.A. ' })).resolves.toEqual({
        customerCode: null,
        taxId: null,
        legalName: 'GT|acme, s.a.',
      });

      const keys = await service.duplicateKeys(
        { country: 'SV', customerCode: 'x1', taxId: '99', legalName: 'Acme' },
        { codeUniqueness: 'GLOBAL', duplicateRules: { razonSocialNormalizada: 'NO', nombreComercialNormalizado: 'NO', correo: 'NO', telefono: 'NO', nit: 'AVISAR' } },
      );
      expect(keys).toEqual({ customerCode: 'X1', taxId: 'SV|99', legalName: null });
    });

    it('devuelve null en las claves sin valor', async () => {
      await expect(service.duplicateKeys({ country: 'GT', customerCode: '  ' })).resolves.toEqual({ customerCode: null, taxId: null, legalName: null });
    });
  });
});
