import { Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';

import type { FieldIssue } from '@/common/errors/field-issue';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import {
  type CatalogReferenceCheck,
  type CatalogReferenceOptions,
  CatalogReferenceValidator,
  type CatalogReferenceIssue,
} from '@/modules/catalogs/catalog-reference.validator';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { REQUIRED_FIELDS_WHITELIST } from '@/modules/parameters/parameter-rules.registry';

import { type CustomerActor, CustomerActorResolver } from './customer-actor.resolver';
import { CUSTOMER_PERMISSIONS } from './customer-access-policy';
import { CUSTOMER_ERROR_CODES, type CustomerCodeConflictDetails, fieldIssue } from './customer-errors';
import { isBrokenCountryPattern, isValidPhone, isValidTaxId } from './customer-field-rules';
import {
  normalizeCustomerCode,
  normalizeEmail,
  normalizeName,
  normalizeTaxId,
  phoneDigits,
  startsWithFormula,
} from './customer-normalization';
import {
  activeRuleKeys,
  CUSTOMER_DUPLICATE_REASONS,
  CUSTOMER_DUPLICATE_RULE_KEYS,
  CUSTOMER_RESTRICTED_ACTIONS,
  type CustomerDuplicateRuleKey,
  evaluateDuplicates,
  parseDuplicateRules,
} from './duplicate-rules';
import {
  type CountryRecord,
  type CustomerDuplicateProbe,
  type CustomerRecord,
  CUSTOMERS_REPOSITORY,
  type CustomersRepository,
  type CustomerVisibility,
  type SalesOwnerAssignableSet,
} from './ports/customers.repository.port';

/** Parámetros del CRM que gobiernan el alta y la edición de clientes (00 §8.2, 02 D.5). */
export const CUSTOMER_PARAMETERS = {
  codeUniqueness: 'crm.clientes.unicidad_codigo',
  duplicateRules: 'crm.clientes.reglas_duplicidad',
  requiredFields: 'crm.campos_obligatorios',
  defaultValues: 'crm.valores_por_defecto',
} as const;

export const CUSTOMER_CATALOGS = {
  companyType: 'crm.tipo_empresa',
  status: 'crm.estado_cliente',
  rating: 'crm.calificacion_cliente',
} as const;

/** `pantalla` (ids) | `importación` (claves naturales: `code`, `isoCode`, código de colaborador o correo, D-02.17). */
export type CustomerRefMode = 'BY_ID' | 'BY_NATURAL_KEY';

/**
 * Valores crudos de la entrada (02 F.6.1). `undefined` = no informado (en la
 * edición: sin cambio); `null` o cadena vacía = sin valor. Los textos llegan sin
 * recortar: la regla de fórmulas (RN-02.32) mira el valor tal cual.
 */
export interface CustomerDraft {
  readonly customerCode?: string | null;
  readonly legalName?: string | null;
  readonly tradeName?: string | null;
  readonly taxId?: string | null;
  /** id del país o `isoCode`, según el modo. */
  readonly country?: string | null;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  /** id o `code` del elemento de catálogo, según el modo. */
  readonly companyType?: string | null;
  readonly status?: string | null;
  readonly rating?: string | null;
  /** id del usuario, o código de colaborador / correo (D-02.17). */
  readonly salesOwner?: string | null;
}

/** Candidato a duplicado tal como lo ve el actor (02 F.3, RN-02.15, D-02.3). */
export interface DuplicateCandidateView {
  /** `null` si no es visible para el actor. */
  readonly id: string | null;
  readonly crmCode: string;
  readonly customerCode: string | null;
  readonly legalName: string;
  readonly country: { readonly isoCode: string; readonly name: string };
  readonly salesOwnerName: string;
  readonly isVisible: boolean;
  readonly isDeleted: boolean;
}

export interface DuplicateCandidate {
  readonly rule: CustomerDuplicateRuleKey;
  /** `LEGAL_NAME | TRADE_NAME | EMAIL | PHONE | TAX_ID`. */
  readonly reason: string;
  readonly candidate: DuplicateCandidateView;
}

/** Valores listos para escribir: ids resueltos y normalizados (RN-02.17). En la edición, el estado completo resultante. */
export interface NormalizedCustomer {
  readonly customerCode: string | null;
  readonly customerCodeNormalized: string | null;
  readonly legalName: string;
  readonly legalNameNormalized: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly taxIdNormalized: string | null;
  readonly countryId: string;
  readonly city: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly companyTypeId: string | null;
  readonly statusId: string;
  readonly ratingId: string | null;
  readonly salesOwnerId: string;
}

export interface ValidationOutcome {
  /** Todas las incidencias, no solo la primera (RN-02.12), ordenadas por gravedad. */
  readonly errors: readonly (FieldIssue & Record<string, unknown>)[];
  /** Duplicados blandos (`AVISAR`), cada uno con su regla y motivo (`TAX_ID` para el NIT). */
  readonly duplicates: readonly DuplicateCandidate[];
  /** Reglas en `BLOQUEAR` (nunca por NIT, DM-4). */
  readonly blockingDuplicates: readonly DuplicateCandidate[];
  /** Código de cliente ya ocupado (RN-02.13); `null` si está libre. */
  readonly codeConflict: CustomerCodeConflictDetails | null;
  /** Solo si no hay `errors`. */
  readonly normalized: NormalizedCustomer | null;
}

export interface CustomerValidationOptions {
  readonly mode: CustomerRefMode;
  readonly actor: CustomerActor;
  /** Cliente que se edita (estado actual). Sin él, es un alta. */
  readonly existing?: CustomerRecord;
  /** Transacción del llamador: catálogos y unicidad se comprueban dentro de ella (00 §3.5). */
  readonly tx?: TransactionContext;
  /**
   * Lecturas previas de `prepare()`. Quien valida dentro de una transacción
   * interactiva lo pasa para no usar conexiones extra del pool mientras la
   * transacción retiene sus bloqueos (02 "Precisiones de implementación"). Sin
   * él, se leen bajo demanda.
   */
  readonly context?: CustomerValidationContext;
  /**
   * Memoria de búsquedas de referencia (país, catálogo, responsable) para validar
   * muchas entradas seguidas **sin** transacción: la vista previa de una carga
   * masiva (06 G.1, PF-06.44). Se ignora con `tx`: el alta definitiva siempre
   * vuelve a leer dentro de su transacción.
   */
  readonly referenceCache?: CustomerReferenceCache;
}

/**
 * Lecturas de referencias ya hechas, por clave de búsqueda. Una instancia por
 * lote (p. ej. por archivo de importación); nunca se comparte entre peticiones.
 */
export class CustomerReferenceCache {
  private readonly entries = new Map<string, Promise<unknown>>();

  remember<T>(key: string, read: () => Promise<T>): Promise<T> {
    let entry = this.entries.get(key) as Promise<T> | undefined;
    if (!entry) {
      entry = read();
      this.entries.set(key, entry);
      // Un fallo (p. ej. transitorio de la base) no se memoriza: la siguiente fila vuelve a leer.
      entry.catch(() => this.entries.delete(key));
    }
    return entry;
  }
}

type DuplicateRuleActions = Readonly<Record<CustomerDuplicateRuleKey, 'NO' | 'AVISAR' | 'BLOQUEAR'>>;

/**
 * Lo que la validación lee fuera de la transacción del llamador: alcances del
 * actor, responsables asignables y parámetros. Ninguno necesita leerse dentro para
 * ser consistente: alcances y parámetros rigen "en la siguiente petición"
 * (ADR-020, DC-3) y el conjunto asignable solo acota la búsqueda; la elegibilidad
 * del responsable, los catálogos, el país, la unicidad y los duplicados sí se
 * comprueban dentro, con el `tx`.
 */
export interface CustomerValidationContext {
  readonly visibility: CustomerVisibility;
  /** `null` si la entrada no obliga a resolver un responsable. */
  readonly assignable: SalesOwnerAssignableSet | null;
  readonly codeUniqueness: 'PAIS' | 'GLOBAL';
  readonly duplicateRules: DuplicateRuleActions;
  readonly requiredFields: readonly (keyof CustomerDraft)[];
  /** Valor de `crm.valores_por_defecto` (solo en el alta; `{}` en la edición). */
  readonly defaultValues: Readonly<Record<string, string | undefined>>;
}

/** Claves normalizadas para detectar duplicados dentro de un mismo archivo de importación (F.6.1). */
export interface CustomerDuplicateKeys {
  /** Bloqueante: código de cliente en el ámbito de `unicidad_codigo` (`GT|AB12` o `AB12` con `GLOBAL`). */
  readonly customerCode: string | null;
  /** Aviso: NIT en el mismo país, solo si la regla `nit` vale `AVISAR` (`GT|123456K`). */
  readonly taxId: string | null;
  /** Aviso: razón social normalizada en el mismo país, si la regla `razonSocialNormalizada` no vale `NO` (06 RN-06.14). */
  readonly legalName: string | null;
}

type DraftField = keyof CustomerDraft;

/** Campo del DTO (y de `details[].field`) de cada entrada del borrador. */
const FIELD_NAMES: Readonly<Record<DraftField, string>> = {
  customerCode: 'customerCode',
  legalName: 'legalName',
  tradeName: 'tradeName',
  taxId: 'taxId',
  country: 'countryId',
  city: 'city',
  address: 'address',
  phone: 'phone',
  email: 'email',
  companyType: 'companyTypeId',
  status: 'statusId',
  rating: 'ratingId',
  salesOwner: 'salesOwnerId',
};
const DRAFT_FIELD_BY_NAME: ReadonlyMap<string, DraftField> = new Map(
  (Object.entries(FIELD_NAMES) as [DraftField, string][]).map(([draftField, name]) => [name, draftField]),
);

/** Longitudes máximas (00 §2.4). La API las valida en el DTO con `400`; la importación las recibe aquí. */
const MAX_LENGTHS: Readonly<Partial<Record<DraftField, number>>> = {
  customerCode: 40,
  legalName: 200,
  tradeName: 200,
  taxId: 30,
  city: 120,
  address: 300,
  phone: 40,
  email: 320,
};

/** Texto libre al que se aplica la regla de fórmulas (RN-02.32). */
const FORMULA_FIELDS: readonly DraftField[] = ['legalName', 'tradeName', 'city', 'address'];

/** Orden de gravedad de las incidencias: el código de la respuesta HTTP es el de la primera. */
const ISSUE_ORDER: readonly string[] = [
  CUSTOMER_ERROR_CODES.validationFailed,
  CUSTOMER_ERROR_CODES.formulaNotAllowed,
  CUSTOMER_ERROR_CODES.requiredFieldMissing,
  CUSTOMER_ERROR_CODES.invalidCountry,
  CUSTOMER_ERROR_CODES.invalidPhoneFormat,
  CUSTOMER_ERROR_CODES.invalidTaxIdFormat,
  'INVALID_CATALOG_VALUE',
  CUSTOMER_ERROR_CODES.invalidSalesOwner,
];

type Issue = FieldIssue & Record<string, unknown>;

function trimToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function bySeverity(a: Issue, b: Issue): number {
  const rank = (issue: Issue): number => {
    const index = ISSUE_ORDER.indexOf(issue.code);
    return index === -1 ? ISSUE_ORDER.length : index;
  };
  return rank(a) - rank(b);
}

function catalogIssue(issue: CatalogReferenceIssue): Issue {
  return { field: issue.field, code: issue.code, message: issue.message, catalogKey: issue.catalogKey, reason: issue.reason };
}

/**
 * Validación única de clientes (02 F.6.1, RN-02.4–RN-02.17, RN-02.32). La usan el
 * alta y la edición de la pantalla y la importación (Módulo 6) **tal cual**: los
 * códigos de `FieldIssue` son los mismos que los de la API, así que la carga
 * masiva muestra por fila el mismo error que la pantalla (AC-02.25).
 *
 * No escribe nada. Devuelve **todas** las incidencias de formato y referencias;
 * la unicidad del código y los duplicados se evalúan solo si no las hay.
 */
@Injectable()
export class CustomerValidationService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customers: CustomersRepository,
    private readonly catalogs: CatalogReferenceValidator,
    private readonly parameters: ParameterReader,
    private readonly actors: CustomerActorResolver,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Lee por adelantado lo que `validate()` necesita fuera de la transacción
   * (`CustomerValidationContext`). `visibility`, si el llamador ya la tiene, se reutiliza.
   */
  async prepare(
    draft: CustomerDraft,
    options: {
      readonly mode: CustomerRefMode;
      readonly actor: CustomerActor;
      readonly existing?: CustomerRecord;
      readonly visibility?: CustomerVisibility;
    },
  ): Promise<CustomerValidationContext> {
    const { mode, actor, existing } = options;
    const isEdit = existing !== undefined;
    const ownerInput = trimToNull(draft.salesOwner) ?? (isEdit ? undefined : actor.userId);
    const needsOwner =
      ownerInput !== undefined && ownerInput !== null && !(existing && mode === 'BY_ID' && ownerInput === existing.salesOwner.id);
    const [visibility, assignable, codeUniqueness, duplicateRules, requiredFields, defaultValues] = await Promise.all([
      options.visibility ?? this.actors.visibility(actor),
      needsOwner ? this.actors.assignableSalesOwners(actor) : null,
      // Sin código no hay unicidad que comprobar (`findCodeConflict` no la usa).
      normalizeCustomerCode(trimToNull(draft.customerCode)) ? this.codeUniqueness() : ('PAIS' as const),
      this.duplicateRules(),
      this.requiredDraftFields(),
      isEdit ? {} : this.parameters.get<Record<string, string | undefined>>(CUSTOMER_PARAMETERS.defaultValues),
    ]);
    return { visibility, assignable, codeUniqueness, duplicateRules, requiredFields, defaultValues };
  }

  async validate(draft: CustomerDraft, options: CustomerValidationOptions): Promise<ValidationOutcome> {
    const { existing, tx, mode, actor, context } = options;
    const isEdit = existing !== undefined;
    const issues: Issue[] = [];
    const provided = (field: DraftField): boolean => draft[field] !== undefined;

    // RN-02.32: sobre el valor crudo y solo en los campos enviados.
    for (const field of FORMULA_FIELDS) {
      if (provided(field) && startsWithFormula(draft[field])) {
        issues.push(fieldIssue(FIELD_NAMES[field], CUSTOMER_ERROR_CODES.formulaNotAllowed));
      }
    }

    const value = (field: DraftField): string | null | undefined => trimToNull(draft[field]);
    for (const [field, max] of Object.entries(MAX_LENGTHS) as [DraftField, number][]) {
      const current = value(field);
      if (current && [...current].length > max) {
        issues.push(fieldIssue(FIELD_NAMES[field], CUSTOMER_ERROR_CODES.validationFailed, { maxLength: max }));
      }
    }
    const email = value('email');
    if (email && !isEmail(email)) {
      issues.push(fieldIssue('email', CUSTOMER_ERROR_CODES.validationFailed));
    }

    // Valores por defecto antes de los obligatorios (RN-02.4). Solo en el alta.
    const cache = tx ? undefined : options.referenceCache;
    const defaults = isEdit ? {} : await this.defaultCatalogValues(mode, tx, context?.defaultValues, cache);
    const salesOwnerInput = value('salesOwner') ?? (isEdit ? undefined : actor.userId);
    const resolvedInput: Partial<Record<DraftField, string | null | undefined>> = {
      ...Object.fromEntries((Object.keys(FIELD_NAMES) as DraftField[]).map((field) => [field, value(field)])),
      companyType: value('companyType') ?? defaults.companyType ?? (isEdit ? value('companyType') : null),
      status: value('status') ?? defaults.status ?? (isEdit ? value('status') : null),
      rating: value('rating') ?? defaults.rating ?? (isEdit ? value('rating') : null),
      salesOwner: salesOwnerInput,
    };

    for (const field of context?.requiredFields ?? (await this.requiredDraftFields())) {
      const current = resolvedInput[field];
      // Alta: falta el valor. Edición: se envía vacío un campo obligatorio (lo no enviado no cambia).
      const isMissing = isEdit ? current === null : current === null || current === undefined;
      if (isMissing) issues.push(fieldIssue(FIELD_NAMES[field], CUSTOMER_ERROR_CODES.requiredFieldMissing));
    }

    // País (RN-02.8): activo para un alta o para cambiarlo; el ya asociado se conserva aunque se desactive.
    const country = await this.resolveCountry(resolvedInput.country, mode, existing, issues, tx, cache);
    const countryChanged = isEdit && country !== null && country.id !== existing.country.id;

    // Teléfono y NIT con el país resultante (también al cambiar de país, D-02.5).
    const phone = resolvedInput.phone === undefined ? (existing?.phone ?? null) : resolvedInput.phone;
    if (country && phone && (provided('phone') || countryChanged || !isEdit)) {
      this.warnBrokenPattern(country, 'phonePattern');
      if (!isValidPhone(phone, country.phonePattern)) {
        issues.push(fieldIssue('phone', CUSTOMER_ERROR_CODES.invalidPhoneFormat));
      }
    }
    const taxId = resolvedInput.taxId === undefined ? (existing?.taxId ?? null) : resolvedInput.taxId;
    const taxIdNormalized = normalizeTaxId(taxId);
    if (country && taxId && (provided('taxId') || countryChanged || !isEdit)) {
      this.warnBrokenPattern(country, 'taxIdPattern');
      if (!taxIdNormalized || !isValidTaxId(taxIdNormalized, country.taxIdPattern)) {
        issues.push(fieldIssue('taxId', CUSTOMER_ERROR_CODES.invalidTaxIdFormat));
      }
    }

    // Catálogos (RN-02.9): cada uno en SU catálogo; alta = activo; edición sin cambio = no se revalida.
    const companyTypeId = await this.resolveCatalog('companyType', CUSTOMER_CATALOGS.companyType, resolvedInput.companyType, existing?.companyType?.id ?? null, options, issues);
    const statusId = await this.resolveCatalog('status', CUSTOMER_CATALOGS.status, resolvedInput.status, existing?.status.id ?? null, options, issues);
    const ratingId = await this.resolveCatalog('rating', CUSTOMER_CATALOGS.rating, resolvedInput.rating, existing?.rating?.id ?? null, options, issues);

    // Responsable (RN-02.10, D-02.2).
    // Sin responsable en el alta se asigna el actor: es un id aunque la entrada venga por clave natural (importación, 06 RN-06.12).
    const ownerMode: CustomerRefMode = !isEdit && (value('salesOwner') ?? null) === null ? 'BY_ID' : mode;
    const salesOwnerId = await this.resolveSalesOwner(resolvedInput.salesOwner, ownerMode, actor, existing, issues, tx, context, cache);

    if (issues.length > 0) {
      return { errors: [...issues].sort(bySeverity), duplicates: [], blockingDuplicates: [], codeConflict: null, normalized: null };
    }

    const pick = <T>(next: T | undefined, current: T): T => (next === undefined ? current : next);
    const customerCode = pick(resolvedInput.customerCode, existing?.customerCode ?? null);
    const legalName = pick(resolvedInput.legalName, existing?.legalName ?? null) ?? '';
    const tradeName = pick(resolvedInput.tradeName, existing?.tradeName ?? null);
    const normalized: NormalizedCustomer = {
      customerCode,
      customerCodeNormalized: normalizeCustomerCode(customerCode),
      legalName,
      legalNameNormalized: normalizeName(legalName) ?? '',
      tradeName,
      taxId,
      taxIdNormalized,
      countryId: (country ?? existing?.country)?.id ?? '',
      city: pick(resolvedInput.city, existing?.city ?? null),
      address: pick(resolvedInput.address, existing?.address ?? null),
      phone,
      email: pick(resolvedInput.email, existing?.email ?? null),
      companyTypeId: pick(companyTypeId, existing?.companyType?.id ?? null),
      statusId: pick(statusId ?? undefined, existing?.status.id ?? ''),
      ratingId: pick(ratingId, existing?.rating?.id ?? null),
      salesOwnerId: pick(salesOwnerId ?? undefined, existing?.salesOwner.id ?? ''),
    };

    const visibility = context?.visibility ?? (await this.actors.visibility(actor));
    const codeConflict = await this.findCodeConflict(normalized, existing, countryChanged, visibility, tx, context?.codeUniqueness);
    const { duplicates, blockingDuplicates } = await this.findDuplicates(
      normalized,
      existing,
      countryChanged,
      actor,
      visibility,
      tx,
      context?.duplicateRules,
    );
    return { errors: [], duplicates, blockingDuplicates, codeConflict, normalized };
  }

  /**
   * Claves normalizadas para detectar duplicados dentro de un archivo (F.6.1, Módulo 6).
   * `context` (de `prepare()`) evita releer los parámetros en cada fila de una carga.
   */
  async duplicateKeys(
    draft: CustomerDraft,
    context?: Pick<CustomerValidationContext, 'codeUniqueness' | 'duplicateRules'>,
  ): Promise<CustomerDuplicateKeys> {
    const country = trimToNull(draft.country)?.toUpperCase() ?? null;
    const code = normalizeCustomerCode(trimToNull(draft.customerCode));
    const taxId = normalizeTaxId(trimToNull(draft.taxId));
    const legalName = normalizeName(trimToNull(draft.legalName));
    const [uniqueness, rules] = context
      ? [context.codeUniqueness, context.duplicateRules]
      : await Promise.all([this.codeUniqueness(), this.duplicateRules()]);
    return {
      customerCode: code ? (uniqueness === 'GLOBAL' ? code : `${country ?? ''}|${code}`) : null,
      taxId: taxId && rules.nit === 'AVISAR' ? `${country ?? ''}|${taxId}` : null,
      legalName: legalName && rules.razonSocialNormalizada !== 'NO' ? `${country ?? ''}|${legalName}` : null,
    };
  }

  async codeUniqueness(): Promise<'PAIS' | 'GLOBAL'> {
    return this.parameters.get<'PAIS' | 'GLOBAL'>(CUSTOMER_PARAMETERS.codeUniqueness);
  }

  private async duplicateRules(): Promise<DuplicateRuleActions> {
    const value = await this.parameters.get<unknown>(CUSTOMER_PARAMETERS.duplicateRules);
    const parsed = parseDuplicateRules(value, CUSTOMER_DUPLICATE_RULE_KEYS, { restrictedActions: CUSTOMER_RESTRICTED_ACTIONS });
    for (const warning of parsed.warnings) {
      this.logger.warn('customer_duplicate_rule_ignored', { parameter: CUSTOMER_PARAMETERS.duplicateRules, key: warning.key, reason: warning.reason });
    }
    return parsed.rules;
  }

  /**
   * Obligatorios del cliente = base + `crm.campos_obligatorios.customer` (RN-02.4).
   * El parámetro solo añade; un campo que no existe en la entrada (p. ej.
   * `primaryContactId`, que se elige después del alta) se ignora con advertencia.
   */
  async requiredFieldNames(): Promise<string[]> {
    return (await this.requiredDraftFields()).map((field) => FIELD_NAMES[field]);
  }

  private async requiredDraftFields(): Promise<DraftField[]> {
    const value = await this.parameters.get<Record<string, string[] | undefined>>(CUSTOMER_PARAMETERS.requiredFields);
    const names = new Set([...(REQUIRED_FIELDS_WHITELIST['customer']?.base ?? []), ...(value['customer'] ?? [])]);
    const fields: DraftField[] = [];
    for (const name of names) {
      const field = DRAFT_FIELD_BY_NAME.get(name);
      if (field) fields.push(field);
      else this.logger.warn('customer_required_field_ignored', { parameter: CUSTOMER_PARAMETERS.requiredFields, field: name });
    }
    return fields;
  }

  /**
   * Valores por defecto de `crm.valores_por_defecto` (`customer.statusId`,
   * `customer.companyTypeId`, `customer.ratingId`; códigos de catálogo). Un código
   * inexistente o inactivo se ignora con advertencia. Devuelve id o código según el modo.
   */
  async defaultCatalogValues(
    mode: CustomerRefMode,
    tx?: TransactionContext,
    parameterValue?: Readonly<Record<string, string | undefined>>,
    cache?: CustomerReferenceCache,
  ): Promise<Partial<Record<'status' | 'companyType' | 'rating', string>>> {
    // El parámetro puede llegar leído de antemano (`prepare`); los catálogos se comprueban con el `tx`.
    const value = parameterValue ?? (await this.parameters.get<Record<string, string | undefined>>(CUSTOMER_PARAMETERS.defaultValues));
    const entries: ['status' | 'companyType' | 'rating', string, string][] = [
      ['status', 'customer.statusId', CUSTOMER_CATALOGS.status],
      ['companyType', 'customer.companyTypeId', CUSTOMER_CATALOGS.companyType],
      ['rating', 'customer.ratingId', CUSTOMER_CATALOGS.rating],
    ];
    const defaults: Partial<Record<'status' | 'companyType' | 'rating', string>> = {};
    for (const [field, key, catalogKey] of entries) {
      const code = value[key];
      if (!code) continue;
      const check = await this.checkCatalog(catalogKey, code, { field: FIELD_NAMES[field], by: 'code', requireActive: true, tx }, cache);
      if (check.ok) {
        defaults[field] = mode === 'BY_ID' ? check.item.id : check.item.code;
      } else {
        this.logger.warn('customer_default_value_ignored', { parameter: CUSTOMER_PARAMETERS.defaultValues, key, reason: check.issue.reason });
      }
    }
    return defaults;
  }

  private async resolveCountry(
    input: string | null | undefined,
    mode: CustomerRefMode,
    existing: CustomerRecord | undefined,
    issues: Issue[],
    tx?: TransactionContext,
    cache?: CustomerReferenceCache,
  ): Promise<CountryRecord | null> {
    if (input === undefined || input === null) {
      return existing?.country ?? null;
    }
    const lookup = { by: mode === 'BY_ID' ? ('id' as const) : ('isoCode' as const), value: input };
    const country = cache
      ? await cache.remember(`country|${lookup.by}|${lookup.value}`, () => this.customers.findCountry(lookup))
      : await this.customers.findCountry(lookup, tx);
    if (country && existing && country.id === existing.country.id) {
      return country;
    }
    if (!country || !country.isActive) {
      issues.push(fieldIssue('countryId', CUSTOMER_ERROR_CODES.invalidCountry));
      return null;
    }
    return country;
  }

  private async resolveCatalog(
    field: 'companyType' | 'status' | 'rating',
    catalogKey: string,
    input: string | null | undefined,
    currentId: string | null,
    options: CustomerValidationOptions,
    issues: Issue[],
  ): Promise<string | null | undefined> {
    if (input === undefined) return undefined;
    if (input === null) return null;
    if (options.mode === 'BY_ID' && currentId !== null && input === currentId) return currentId;
    const check = await this.checkCatalog(
      catalogKey,
      input,
      { field: FIELD_NAMES[field], by: options.mode === 'BY_ID' ? 'id' : 'code', requireActive: true, currentId, tx: options.tx },
      options.tx ? undefined : options.referenceCache,
    );
    if (!check.ok) {
      issues.push(catalogIssue(check.issue));
      return undefined;
    }
    return check.item.id;
  }

  private async resolveSalesOwner(
    input: string | null | undefined,
    mode: CustomerRefMode,
    actor: CustomerActor,
    existing: CustomerRecord | undefined,
    issues: Issue[],
    tx?: TransactionContext,
    context?: CustomerValidationContext,
    cache?: CustomerReferenceCache,
  ): Promise<string | null | undefined> {
    if (input === undefined || input === null) return undefined;
    if (existing && mode === 'BY_ID' && input === existing.salesOwner.id) return input;
    const assignable: SalesOwnerAssignableSet = context?.assignable ?? (await this.actors.assignableSalesOwners(actor));
    const lookup = mode === 'BY_ID' ? ({ by: 'id', value: input } as const) : ({ by: 'naturalKey', value: input } as const);
    const salesOwnerId = cache
      ? await cache.remember(`owner|${lookup.by}|${lookup.value}`, () => this.customers.findEligibleSalesOwner(lookup, assignable, CUSTOMER_PERMISSIONS.view))
      : await this.customers.findEligibleSalesOwner(lookup, assignable, CUSTOMER_PERMISSIONS.view, tx);
    if (!salesOwnerId) {
      issues.push(fieldIssue('salesOwnerId', CUSTOMER_ERROR_CODES.invalidSalesOwner));
      return undefined;
    }
    return salesOwnerId;
  }

  /** RN-02.13: código único por país, o global con `unicidad_codigo = GLOBAL`. Incluye eliminados. */
  private async findCodeConflict(
    normalized: NormalizedCustomer,
    existing: CustomerRecord | undefined,
    countryChanged: boolean,
    visibility: CustomerVisibility,
    tx?: TransactionContext,
    preparedUniqueness?: 'PAIS' | 'GLOBAL',
  ): Promise<CustomerCodeConflictDetails | null> {
    const code = normalized.customerCodeNormalized;
    if (!code) return null;
    if (existing && code === existing.customerCodeNormalized && !countryChanged) return null;
    const uniqueness = preparedUniqueness ?? (await this.codeUniqueness());
    const holder = await this.customers.findCustomerCodeHolder(
      code,
      { countryId: uniqueness === 'GLOBAL' ? null : normalized.countryId, excludeCustomerId: existing?.id ?? null },
      visibility,
      tx,
    );
    return holder ? { customerId: holder.isInScope ? holder.id : null, crmCode: holder.crmCode, isDeleted: holder.isDeleted } : null;
  }

  /**
   * RN-02.14: en el alta todas las reglas; en la edición solo las de los valores
   * que cambian, y todas si cambia el país (D-02.5). Mismo país (D-02.4), incluidos eliminados.
   */
  private async findDuplicates(
    normalized: NormalizedCustomer,
    existing: CustomerRecord | undefined,
    countryChanged: boolean,
    actor: CustomerActor,
    visibility: CustomerVisibility,
    tx?: TransactionContext,
    preparedRules?: DuplicateRuleActions,
  ): Promise<{ duplicates: DuplicateCandidate[]; blockingDuplicates: DuplicateCandidate[] }> {
    const rules = preparedRules ?? (await this.duplicateRules());
    const values: Record<CustomerDuplicateRuleKey, string | null> = {
      razonSocialNormalizada: normalized.legalNameNormalized || null,
      nombreComercialNormalizado: normalizeName(normalized.tradeName),
      correo: normalizeEmail(normalized.email),
      telefono: phoneDigits(normalized.phone),
      nit: normalized.taxIdNormalized,
    };
    const previous: Record<CustomerDuplicateRuleKey, string | null> | null = existing
      ? {
          razonSocialNormalizada: existing.legalNameNormalized,
          nombreComercialNormalizado: normalizeName(existing.tradeName),
          correo: normalizeEmail(existing.email),
          telefono: phoneDigits(existing.phone),
          nit: existing.taxIdNormalized,
        }
      : null;

    const keys = activeRuleKeys(rules).filter(
      (key) => values[key] !== null && (previous === null || countryChanged || previous[key] !== values[key]),
    );
    if (keys.length === 0) return { duplicates: [], blockingDuplicates: [] };

    const probe: CustomerDuplicateProbe = {
      countryId: normalized.countryId,
      excludeCustomerId: existing?.id ?? null,
      ...Object.fromEntries(keys.map((key) => [key, values[key]])),
    };
    const rows = await this.customers.findDuplicateCandidates(probe, visibility, tx);
    const canSeeDeleted = actor.permissions.has(CUSTOMER_PERMISSIONS.delete);
    const matches = rows.flatMap((row) => {
      const isVisible = row.candidate.isInScope && (!row.candidate.isDeleted || canSeeDeleted);
      const candidate: DuplicateCandidateView = {
        id: isVisible ? row.candidate.id : null,
        crmCode: row.candidate.crmCode,
        customerCode: row.candidate.customerCode,
        legalName: row.candidate.legalName,
        country: row.candidate.country,
        salesOwnerName: row.candidate.salesOwnerName,
        isVisible,
        isDeleted: row.candidate.isDeleted,
      };
      return row.rules.filter((rule) => keys.includes(rule)).map((rule) => ({ rule, candidate }));
    });
    const evaluation = evaluateDuplicates(rules, matches);
    const toCandidate = (match: { rule: CustomerDuplicateRuleKey; candidate: DuplicateCandidateView }): DuplicateCandidate => ({
      rule: match.rule,
      reason: CUSTOMER_DUPLICATE_REASONS[match.rule],
      candidate: match.candidate,
    });
    return { duplicates: evaluation.warnings.map(toCandidate), blockingDuplicates: evaluation.blocking.map(toCandidate) };
  }

  /** `CatalogReferenceValidator.check`, memorizado por la clave completa de la búsqueda si hay memoria. */
  private checkCatalog(
    catalogKey: string,
    value: string,
    options: CatalogReferenceOptions,
    cache: CustomerReferenceCache | undefined,
  ): Promise<CatalogReferenceCheck> {
    if (!cache) return this.catalogs.check(catalogKey, value, options);
    const key = `catalog|${catalogKey}|${options.by ?? 'id'}|${value}|${options.requireActive ?? true}|${options.currentId ?? ''}|${options.field}`;
    return cache.remember(key, () => this.catalogs.check(catalogKey, value, { ...options, tx: undefined }));
  }

  private warnBrokenPattern(country: CountryRecord, column: 'phonePattern' | 'taxIdPattern'): void {
    if (isBrokenCountryPattern(country[column])) {
      this.logger.warn('country_pattern_invalid', { countryId: country.id, column });
    }
  }
}
