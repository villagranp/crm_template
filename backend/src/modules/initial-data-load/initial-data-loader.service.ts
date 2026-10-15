import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError, ResourceConflictError } from '@/common/errors/application-error';
import { AccessService } from '@/modules/access/access.service';
import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { PRODUCT_CONFIGURE_PERMISSION } from '@/modules/products/product-masters.mappers';
import { ProductMastersService } from '@/modules/products/product-masters.service';
import { ProjectClassificationService } from '@/modules/projects/project-classification.service';
import { type ProjectActor, ProjectAccessService } from '@/modules/projects/project-access.service';
import { PROJECT_CATALOGS, PROJECT_PARAMETERS, PROJECT_PERMISSIONS } from '@/modules/projects/project-constants';
import { ProjectsService } from '@/modules/projects/projects.service';
import { projectRequiredFields } from '@/modules/projects/project-rules';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { isPastDate } from '@/modules/safety-minutes/safety-minute-rules';
import { SAFETY_MINUTE_CREATE_PERMISSION } from '@/modules/safety-minutes/safety-minute-permissions';
import { SafetyMinutesService } from '@/modules/safety-minutes/safety-minutes.service';

import { DEFAULT_READ_LIMITS, type LoadReadLimits, type LoadSource, type ParsedSheet, readLoadSource } from './initial-data-file-reader';
import {
  type FamilyDraft,
  type LoadRow,
  type MinuteDraft,
  type ProductDraft,
  type ProjectDraft,
  sanitizeSheet,
  SheetCollector,
  validateFamilyRows,
  validateMinuteRows,
  validateProductRows,
  validateProjectRows,
} from './initial-data-rows';
import { fileProblemReport, type LoadMode, type LoadReport, newReport, type SheetSummary } from './initial-data-report';
import { entityDefinition, type InitialDataEntity, type LoadSheet } from './initial-data-templates';
import {
  INITIAL_DATA_LOOKUP,
  type InitialDataLookup,
  type LookupReference,
  type LookupUser,
  type TemplateValueSet,
} from './ports/initial-data-lookup.port';

/** Por qué no se acepta el `--actor` (el mensaje nunca repite lo que se escribió). */
export type ActorRejection = 'ACTOR_NOT_FOUND' | 'ACTOR_NOT_ACTIVE' | 'ACTOR_NOT_ADMIN' | 'ACTOR_LACKS_PERMISSION';

const ACTOR_MESSAGES: Readonly<Record<ActorRejection, string>> = {
  ACTOR_NOT_FOUND: 'No existe un usuario con el correo o código de colaborador indicado en --actor.',
  ACTOR_NOT_ACTIVE: 'El usuario indicado en --actor no está activo.',
  ACTOR_NOT_ADMIN: 'El usuario indicado en --actor no tiene el rol de administrador vigente.',
  ACTOR_LACKS_PERMISSION: 'El usuario indicado en --actor no tiene el permiso necesario para esta carga.',
};

export class ActorRejectedError extends Error {
  constructor(readonly reason: ActorRejection) {
    super(ACTOR_MESSAGES[reason]);
    this.name = 'ActorRejectedError';
  }
}

/** Permisos que debe tener el actor, por entidad (además del rol de administrador). */
const ENTITY_PERMISSIONS: Readonly<Record<InitialDataEntity, readonly string[]>> = {
  projects: [PROJECT_PERMISSIONS.create, PROJECT_PERMISSIONS.administer],
  products: [PRODUCT_CONFIGURE_PERMISSION],
  'safety-minutes': [SAFETY_MINUTE_CREATE_PERMISSION],
};

/**
 * La parametrización de campos obligatorios exige algo que la plantilla no trae (unidad de medida o
 * cantidad estimada al clasificar): el archivo no puede cumplirla, así que se aborta antes de escribir.
 */
export class TemplateCannotSatisfyError extends Error {
  constructor() {
    super('La parametrización de campos obligatorios de proyectos exige la unidad de medida o la cantidad estimada, que la plantilla no incluye.');
    this.name = 'TemplateCannotSatisfyError';
  }
}

/** Campos generales obligatorios que la plantilla trae como columna (los demás: nombre, cliente, país y responsable, siempre tienen valor). */
const GENERAL_FIELD_COLUMNS: Readonly<Record<string, 'city' | 'address' | 'description' | 'estimatedStartDate' | 'estimatedEndDate' | 'estimatedDecisionDate' | undefined>> = {
  city: 'city',
  address: 'address',
  description: 'description',
  estimatedStartDate: 'estimatedStartDate',
  estimatedEndDate: 'estimatedEndDate',
  estimatedDecisionDate: 'estimatedDecisionDate',
};

/** Quien carga: el usuario local y el contexto que esperan los servicios de aplicación. */
export interface LoadActor {
  readonly userId: string;
  readonly context: ProjectActor;
}

export interface LoadOptions {
  readonly limits?: LoadReadLimits;
}

interface ProjectPlan {
  readonly draft: ProjectDraft;
  readonly customerId: string;
  readonly countryId: string | null;
  readonly ownerId: string | null;
  readonly projectTypeId: string | null;
  readonly sectorId: string | null;
}

interface ProductPlan {
  readonly draft: ProductDraft;
  readonly familyId: string | null;
  readonly baseUnitId: string;
}

interface Plan {
  readonly families: FamilyDraft[];
  readonly products: ProductPlan[];
  readonly projects: ProjectPlan[];
  readonly minutes: MinuteDraft[];
}

interface Prepared {
  readonly collectors: ReadonlyMap<string, SheetCollector>;
  readonly read: ReadonlyMap<string, number>;
  readonly plan: Plan;
}

const FIELD_COLUMNS: Readonly<Record<InitialDataEntity, Readonly<Record<string, string>>>> = {
  projects: {
    name: 'name',
    customerId: 'customerCrmCode',
    countryId: 'country',
    ownerId: 'owner',
    code: 'code',
    estimatedEndDate: 'estimatedEndDate',
    estimatedStartDate: 'estimatedStartDate',
  },
  products: { code: 'code', sku: 'sku', familyId: 'family', baseUnitId: 'baseUnit' },
  'safety-minutes': { displayDate: 'displayDate', message: 'message' },
};

/**
 * Carga inicial de datos por scripts (`docs/implementation-plans/CARGA-INICIAL.md`).
 *
 * `validate` lee y valida el archivo y **no escribe nada**. `apply` valida y, solo si no hay
 * ningún error, crea cada fila con el servicio de aplicación existente (proyectos, familias,
 * productos, minutos de seguridad), de modo que se respetan invariantes, folios, unicidad,
 * visibilidad y auditoría (cada creación deja su evento con el actor indicado). Lo que ya existe
 * se reporta como «ya existe» y se omite sin modificarlo: repetir la carga es seguro.
 *
 * Esta clase no importa Prisma: lee referencias por el puerto `InitialDataLookup`. Los informes
 * nunca incluyen el contenido de las celdas.
 */
@Injectable()
export class InitialDataLoader {
  constructor(
    @Inject(INITIAL_DATA_LOOKUP) private readonly lookup: InitialDataLookup,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
    private readonly classification: ProjectClassificationService,
    private readonly projectAccess: ProjectAccessService,
    private readonly customerGuard: CustomerReferenceGuard,
    private readonly masters: ProductMastersService,
    private readonly safetyMinutes: SafetyMinutesService,
    private readonly parameters: ParameterReader,
  ) {}

  templateValues(): Promise<TemplateValueSet> {
    return this.lookup.listTemplateValues();
  }

  /** Valida sin escribir. Con `actorIdentifier` además comprueba al actor y, en proyectos, lo que sus permisos dejan ver y asignar. */
  async validate(entity: InitialDataEntity, source: LoadSource, actorIdentifier?: string, options: LoadOptions = {}): Promise<LoadReport> {
    const actor = actorIdentifier === undefined ? null : await this.resolveActor(actorIdentifier, entity);
    return this.run(entity, 'validate', source, actor, options);
  }

  /** Valida y, si no hay errores, aplica. Lanza `ActorRejectedError` si el actor no es válido (antes de leer el archivo). */
  async apply(entity: InitialDataEntity, source: LoadSource, actorIdentifier: string, options: LoadOptions = {}): Promise<LoadReport> {
    const actor = await this.resolveActor(actorIdentifier, entity);
    return this.run(entity, 'apply', source, actor, options);
  }

  // -------------------------------------------------------------------------
  // Actor
  // -------------------------------------------------------------------------

  async resolveActor(identifier: string, entity: InitialDataEntity): Promise<LoadActor> {
    const text = identifier.trim();
    const byEmail = text.includes('@');
    const [user] = await this.lookup.findUsers(byEmail ? { emails: [text.toLowerCase()], employeeCodes: [] } : { emails: [], employeeCodes: [text] });
    if (!user) throw new ActorRejectedError('ACTOR_NOT_FOUND');
    if (user.isDeleted || user.status !== 'ACTIVE') throw new ActorRejectedError('ACTOR_NOT_ACTIVE');
    if (!(await this.access.isAdministrador(user.id))) throw new ActorRejectedError('ACTOR_NOT_ADMIN');
    const permissions = await this.access.getEffectivePermissions(user.id);
    if (!ENTITY_PERMISSIONS[entity].every((permission) => permissions.has(permission))) throw new ActorRejectedError('ACTOR_LACKS_PERMISSION');
    return {
      userId: user.id,
      context: { userId: user.id, permissions, audit: { correlationId: randomUUID(), actorId: user.id, actorEmail: user.email, ipAddress: null } },
    };
  }

  // -------------------------------------------------------------------------
  // Orquestación
  // -------------------------------------------------------------------------

  private async run(entity: InitialDataEntity, mode: LoadMode, source: LoadSource, actor: LoadActor | null, options: LoadOptions): Promise<LoadReport> {
    const definition = entityDefinition(entity);
    const read = await readLoadSource(definition, source, options.limits ?? DEFAULT_READ_LIMITS);
    if (!read.ok) return fileProblemReport(entity, mode, read.problems);

    let prepared: Prepared;
    try {
      prepared = await this.prepare(entity, read.sheets, actor);
    } catch (error) {
      if (!(error instanceof TemplateCannotSatisfyError)) throw error;
      const message = `${error.message} Ajuste la parametrización o pida una plantilla nueva; no se aplicó nada.`;
      return fileProblemReport(entity, mode, [{ sheet: null, row: null, column: null, status: 'ERROR', code: 'TEMPLATE_CANNOT_SATISFY', message }]);
    }
    const hasErrors = [...prepared.collectors.values()].some((collector) => collector.errorRowCount > 0);
    if (mode === 'apply' && !hasErrors && actor) {
      const created = await this.execute(entity, prepared, actor);
      return this.report(entity, mode, definition.sheets, prepared, created, true);
    }
    return this.report(entity, mode, definition.sheets, prepared, new Map(), false);
  }

  private report(
    entity: InitialDataEntity,
    mode: LoadMode,
    sheets: readonly LoadSheet[],
    prepared: Prepared,
    created: ReadonlyMap<string, number>,
    applied: boolean,
  ): LoadReport {
    const summaries: SheetSummary[] = [];
    const entries = [];
    for (const sheet of sheets) {
      const collector = prepared.collectors.get(sheet.id);
      if (!collector) continue;
      summaries.push({
        sheet: sheet.sheetName,
        read: prepared.read.get(sheet.id) ?? 0,
        toCreate: this.plannedCount(sheet, prepared.plan),
        created: created.get(sheet.id) ?? 0,
        exists: collector.existingRowCount,
        existsDifferent: collector.differentRowCount,
        createdWithWarning: collector.warnedCreatedRowCount,
        errors: collector.errorRowCount,
      });
      // Por fila (los errores de estructura de archivo, sin fila, primero); entre iguales, en el orden en que se detectaron.
      entries.push(...[...collector.entries].sort((a, b) => (a.row ?? 0) - (b.row ?? 0)));
    }
    return newReport(entity, mode, summaries, entries, applied);
  }

  private plannedCount(sheet: LoadSheet, plan: Plan): number {
    switch (sheet.id) {
      case 'families':
        return plan.families.length;
      case 'products':
        return plan.products.length;
      case 'projects':
        return plan.projects.length;
      case 'safety-minutes':
        return plan.minutes.length;
    }
  }

  private async prepare(entity: InitialDataEntity, sheets: readonly ParsedSheet[], actor: LoadActor | null): Promise<Prepared> {
    const collectors = new Map<string, SheetCollector>();
    const read = new Map<string, number>();
    const rowsOf = new Map<string, LoadRow[]>();
    for (const parsed of sheets) {
      const collector = new SheetCollector(parsed.sheet);
      collectors.set(parsed.sheet.id, collector);
      read.set(parsed.sheet.id, parsed.rows.length);
      rowsOf.set(parsed.sheet.id, sanitizeSheet(parsed, collector));
    }
    const collectorOf = (id: string): SheetCollector => collectors.get(id) as SheetCollector;
    const rows = (id: string): LoadRow[] => rowsOf.get(id) ?? [];

    let plan: Plan = { families: [], products: [], projects: [], minutes: [] };
    if (entity === 'safety-minutes') {
      plan = { ...plan, minutes: await this.planMinutes(rows('safety-minutes'), collectorOf('safety-minutes')) };
    } else if (entity === 'products') {
      plan = { ...plan, ...(await this.planProducts(rows('families'), collectorOf('families'), rows('products'), collectorOf('products'))) };
    } else {
      plan = { ...plan, projects: await this.planProjects(rows('projects'), collectorOf('projects'), actor) };
    }
    return { collectors, read, plan };
  }

  // -------------------------------------------------------------------------
  // Minutos de seguridad
  // -------------------------------------------------------------------------

  private async planMinutes(rows: readonly LoadRow[], collector: SheetCollector): Promise<MinuteDraft[]> {
    const drafts = validateMinuteRows(rows, collector);
    const today = await this.safetyMinutes.today();
    const candidates: MinuteDraft[] = [];
    for (const draft of drafts) {
      if (isPastDate(draft.displayDate, today)) {
        collector.error(draft.fileRow, 'displayDate', 'PAST_DATE', 'La fecha ya pasó: solo se admiten hoy o fechas futuras (zona horaria del negocio).');
      } else {
        candidates.push(draft);
      }
    }
    const existing = new Set(await this.lookup.findExistingSafetyMinuteDates(candidates.map((draft) => draft.displayDate)));
    const planned: MinuteDraft[] = [];
    for (const draft of candidates) {
      if (existing.has(draft.displayDate)) collector.exists(draft.fileRow, 'displayDate', 'Ya existe un minuto de seguridad para esa fecha; no se modifica.');
      else planned.push(draft);
    }
    return planned;
  }

  // -------------------------------------------------------------------------
  // Familias y productos
  // -------------------------------------------------------------------------

  private async planProducts(
    familyRows: readonly LoadRow[],
    familyCollector: SheetCollector,
    productRows: readonly LoadRow[],
    productCollector: SheetCollector,
  ): Promise<{ families: FamilyDraft[]; products: ProductPlan[] }> {
    const familyDrafts = validateFamilyRows(familyRows, familyCollector);
    const productDrafts = validateProductRows(productRows, productCollector);

    // Códigos de familia que el archivo declara (aunque su fila tenga un error propio, para no duplicar el reporte).
    const declared = new Set(familyRows.flatMap((row) => (row.values['code'] ? [row.values['code'].trim().toUpperCase()] : [])));
    const referencedCodes = [...new Set([...familyDrafts.map((draft) => draft.code), ...productDrafts.map((draft) => draft.familyCode)])];
    const dbFamilies = new Map((await this.lookup.findFamilies(referencedCodes)).map((family) => [family.code, family]));

    const newFamilies: FamilyDraft[] = [];
    for (const draft of familyDrafts) {
      const existing = dbFamilies.get(draft.code);
      if (!existing) newFamilies.push(draft);
      else if (existing.name === draft.name && existing.description === draft.description && existing.sortOrder === draft.sortOrder) {
        familyCollector.exists(draft.fileRow, 'code', 'Ya existe una familia con ese código; no se modifica.');
      } else {
        familyCollector.existsDifferent(draft.fileRow, 'code', 'Ya existe una familia con ese código pero con otro nombre, descripción u orden; se omite sin modificarla.');
      }
    }

    const units = new Map((await this.lookup.findUnits([...new Set(productDrafts.map((draft) => draft.baseUnitCode))])).map((unit) => [unit.code, unit]));
    const existingProducts = new Map((await this.lookup.findProducts(productDrafts.map((draft) => draft.sku))).map((existing) => [existing.sku, existing]));

    const products: ProductPlan[] = [];
    for (const draft of productDrafts) {
      const family = dbFamilies.get(draft.familyCode);
      if (family) {
        if (!family.isActive) productCollector.error(draft.fileRow, 'family', 'INACTIVE_REFERENCE', 'La familia está inactiva.');
      } else if (!declared.has(draft.familyCode)) {
        productCollector.error(draft.fileRow, 'family', 'UNKNOWN_REFERENCE', 'La familia no existe ni está definida en la hoja Familias del archivo.');
      }
      const unit = units.get(draft.baseUnitCode);
      if (!unit) productCollector.error(draft.fileRow, 'baseUnit', 'UNKNOWN_REFERENCE', 'La unidad base no existe.');
      else if (!unit.isActive) productCollector.error(draft.fileRow, 'baseUnit', 'INACTIVE_REFERENCE', 'La unidad base está inactiva.');
      if (productCollector.hasError(draft.fileRow)) continue;
      const existing = existingProducts.get(draft.sku);
      if (existing) {
        if (existing.description === draft.description && existing.familyCode === draft.familyCode && existing.baseUnitCode === draft.baseUnitCode) {
          productCollector.exists(draft.fileRow, 'sku', 'Ya existe un producto con ese SKU; no se modifica.');
        } else {
          productCollector.existsDifferent(draft.fileRow, 'sku', 'Ya existe un producto con ese SKU pero con otra descripción, familia o unidad; se omite sin modificarlo.');
        }
        continue;
      }
      products.push({ draft, familyId: family?.id ?? null, baseUnitId: (unit as LookupReference).id });
    }
    return { families: newFamilies, products };
  }

  // -------------------------------------------------------------------------
  // Proyectos
  // -------------------------------------------------------------------------

  private async planProjects(rows: readonly LoadRow[], collector: SheetCollector, actor: LoadActor | null): Promise<ProjectPlan[]> {
    const drafts = validateProjectRows(rows, collector);
    const unique = <T>(values: readonly (T | null)[]): T[] => [...new Set(values.filter((value): value is T => value !== null))];

    const ownerRefs = drafts.flatMap((draft) => (draft.owner ? [draft.owner] : []));
    const [customers, countries, types, sectors, users] = await Promise.all([
      this.lookup.findCustomersByCrmCode(unique(drafts.map((draft) => draft.customerCrmCode))),
      this.lookup.findCountriesByIso(unique(drafts.map((draft) => draft.countryIso))),
      this.lookup.findCatalogItems(PROJECT_CATALOGS.projectType, unique(drafts.map((draft) => draft.projectTypeCode))),
      this.lookup.findCatalogItems(PROJECT_CATALOGS.sector, unique(drafts.map((draft) => draft.sectorCode))),
      this.lookup.findUsers({
        emails: unique(ownerRefs.map((owner) => (owner.kind === 'email' ? owner.value : null))),
        employeeCodes: unique(ownerRefs.map((owner) => (owner.kind === 'employeeCode' ? owner.value : null))),
      }),
    ]);
    const customerByCode = new Map(customers.map((customer) => [customer.crmCode.toUpperCase(), customer]));
    const countryByIso = new Map(countries.map((country) => [country.code.toUpperCase(), country]));
    const typeByCode = new Map(types.map((item) => [item.code.toUpperCase(), item]));
    const sectorByCode = new Map(sectors.map((item) => [item.code.toUpperCase(), item]));
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const userByCode = new Map(users.flatMap((user) => (user.employeeCode ? [[user.employeeCode, user] as const] : [])));

    const referenced = (
      draft: ProjectDraft,
      key: 'country' | 'projectType' | 'sector',
      code: string | null,
      map: ReadonlyMap<string, LookupReference>,
      what: string,
    ): string | null => {
      if (code === null) return null;
      const found = map.get(code);
      if (!found) collector.error(draft.fileRow, key, 'UNKNOWN_REFERENCE', `${what} no existe.`);
      else if (!found.isActive) collector.error(draft.fileRow, key, 'INACTIVE_REFERENCE', `${what} está inactivo.`);
      return found?.id ?? null;
    };

    const resolved = drafts.map((draft) => {
      const customer = customerByCode.get(draft.customerCrmCode);
      if (!customer) collector.error(draft.fileRow, 'customerCrmCode', 'UNKNOWN_REFERENCE', 'No existe un cliente con ese código CRM.');
      else if (customer.isDeleted) collector.error(draft.fileRow, 'customerCrmCode', 'INACTIVE_REFERENCE', 'El cliente está eliminado.');
      const countryId = referenced(draft, 'country', draft.countryIso, countryByIso, 'El país');
      const projectTypeId = referenced(draft, 'projectType', draft.projectTypeCode, typeByCode, 'El tipo de proyecto');
      const sectorId = referenced(draft, 'sector', draft.sectorCode, sectorByCode, 'El sector');
      let ownerId: string | null = null;
      if (draft.owner) {
        const owner: LookupUser | undefined = draft.owner.kind === 'email' ? userByEmail.get(draft.owner.value) : userByCode.get(draft.owner.value);
        if (!owner) collector.error(draft.fileRow, 'owner', 'UNKNOWN_REFERENCE', 'No existe un usuario con ese correo o código de colaborador.');
        else if (owner.isDeleted || owner.status !== 'ACTIVE') collector.error(draft.fileRow, 'owner', 'INACTIVE_REFERENCE', 'El responsable no es un usuario activo.');
        else ownerId = owner.id;
      }
      return { draft, customerId: customer?.id ?? '', countryId, ownerId, projectTypeId, sectorId };
    });

    // «Ya existe» solo si coincide cliente + nombre; un código ya usado por otro cliente u otro nombre es un conflicto (bloquea).
    const clean = resolved.filter((item) => !collector.hasError(item.draft.fileRow));
    const byCode = new Map((await this.lookup.findProjectsByCodes(unique(clean.map((item) => item.draft.code)))).map((project) => [project.code.toUpperCase(), project]));
    const namesByCustomer = new Map<string, Map<string, string>>();
    for (const project of await this.lookup.findProjectsOfCustomers(unique(clean.map((item) => item.customerId)))) {
      const names = namesByCustomer.get(project.customerId) ?? new Map<string, string>();
      names.set(project.nameNormalized, project.code);
      namesByCustomer.set(project.customerId, names);
    }
    const unmatched: ProjectPlan[] = [];
    for (const item of clean) {
      const name = normalizeName(item.draft.name) ?? '';
      const sameCode = item.draft.code === null ? undefined : byCode.get(item.draft.code);
      if (sameCode) {
        if (sameCode.customerId === item.customerId && sameCode.nameNormalized === name) {
          collector.exists(item.draft.fileRow, 'code', 'Ya existe un proyecto con ese código, cliente y nombre; no se modifica.');
        } else {
          collector.error(item.draft.fileRow, 'code', 'CODE_CONFLICT', 'Ese código de proyecto ya lo usa un proyecto de otro cliente o con otro nombre.');
        }
        continue;
      }
      const existingCode = namesByCustomer.get(item.customerId)?.get(name);
      if (existingCode === undefined) unmatched.push(item);
      else if (item.draft.code !== null && existingCode.toUpperCase() !== item.draft.code) {
        collector.existsDifferent(item.draft.fileRow, 'code', 'Ya existe un proyecto de ese cliente con ese nombre pero con otro código; se omite sin modificarlo.');
      } else {
        collector.exists(item.draft.fileRow, 'name', 'Ya existe un proyecto de ese cliente con ese nombre; no se modifica.');
      }
    }

    // Obligatorios parametrizados (`crm.campos_obligatorios`, clave `project`): se anticipan para no fallar a mitad de `apply`.
    const required = projectRequiredFields(await this.parameters.get<Record<string, string[] | undefined>>(PROJECT_PARAMETERS.requiredFields));
    const classifies = (item: ProjectPlan): boolean => item.draft.projectTypeCode !== null || item.draft.sectorCode !== null;
    if (unmatched.some(classifies) && required.classification.some((field) => field === 'measureUnitId' || field === 'estimatedQuantity')) {
      throw new TemplateCannotSatisfyError();
    }
    const pending: ProjectPlan[] = [];
    for (const item of unmatched) {
      for (const field of required.general) {
        const column = GENERAL_FIELD_COLUMNS[field];
        if (column && item.draft[column] === null) {
          collector.error(item.draft.fileRow, column, 'REQUIRED_FIELD_MISSING', 'El campo es obligatorio según la parametrización de campos obligatorios de proyectos.');
        }
      }
      if (classifies(item)) {
        if (required.classification.includes('projectTypeId') && item.draft.projectTypeCode === null) {
          collector.error(item.draft.fileRow, 'projectType', 'REQUIRED_FIELD_MISSING', 'El tipo es obligatorio al clasificar el proyecto (parametrización de campos obligatorios).');
        }
        if (required.classification.includes('sectorId') && item.draft.sectorCode === null) {
          collector.error(item.draft.fileRow, 'sector', 'REQUIRED_FIELD_MISSING', 'El sector es obligatorio al clasificar el proyecto (parametrización de campos obligatorios).');
        }
      }
      if (!collector.hasError(item.draft.fileRow)) pending.push(item);
    }

    return actor ? this.preflightProjects(pending, collector, actor) : pending;
  }

  /**
   * Con un actor, comprueba antes de escribir lo que los servicios comprobarían fila a fila: que el
   * cliente sea visible y activo para él y que el responsable sea asignable. Así un problema de
   * este tipo se reporta en la validación y `apply` no deja una carga a medias.
   */
  private async preflightProjects(pending: readonly ProjectPlan[], collector: SheetCollector, actor: LoadActor): Promise<ProjectPlan[]> {
    const scopes = await this.projectAccess.scopes(actor.context);
    const usableCustomers = new Map<string, boolean>();
    const assignableOwners = new Map<string, boolean>();
    const accepted: ProjectPlan[] = [];
    for (const item of pending) {
      let usable = usableCustomers.get(item.customerId);
      if (usable === undefined) {
        try {
          await this.customerGuard.assertUsableCustomer(item.customerId, actor.context, { requireActive: true });
          usable = true;
        } catch (error) {
          if (!(error instanceof ApplicationError)) throw error;
          usable = false;
        }
        usableCustomers.set(item.customerId, usable);
      }
      if (!usable) collector.error(item.draft.fileRow, 'customerCrmCode', 'CUSTOMER_NOT_USABLE', 'El cliente no está activo o el actor no puede verlo.');

      if (item.ownerId !== null && item.ownerId !== actor.userId) {
        let assignable = assignableOwners.get(item.ownerId);
        if (assignable === undefined) {
          assignable = await this.projectAccess.isAssignableOwner(actor.context, item.ownerId, scopes);
          assignableOwners.set(item.ownerId, assignable);
        }
        if (!assignable) {
          collector.error(item.draft.fileRow, 'owner', 'INVALID_OWNER', 'El responsable no puede asignarse: debe estar activo, poder ver proyectos y estar en el alcance del actor.');
        }
      }
      if (!collector.hasError(item.draft.fileRow)) accepted.push(item);
    }
    return accepted;
  }

  // -------------------------------------------------------------------------
  // Aplicación (solo con la validación limpia)
  // -------------------------------------------------------------------------

  private async execute(entity: InitialDataEntity, prepared: Prepared, actor: LoadActor): Promise<Map<string, number>> {
    const created = new Map<string, number>();
    const bump = (sheet: string): void => {
      created.set(sheet, (created.get(sheet) ?? 0) + 1);
    };
    const collector = (id: string): SheetCollector => prepared.collectors.get(id) as SheetCollector;
    const masterActor = { userId: actor.userId, audit: actor.context.audit };

    if (entity === 'safety-minutes') {
      for (const draft of prepared.plan.minutes) {
        await this.attempt(entity, collector('safety-minutes'), draft.fileRow, async () => {
          await this.safetyMinutes.create({ message: draft.message, displayDate: draft.displayDate }, masterActor);
          bump('safety-minutes');
        });
      }
    } else if (entity === 'products') {
      const familyIds = new Map<string, string>();
      for (const draft of prepared.plan.families) {
        await this.attempt(entity, collector('families'), draft.fileRow, async () => {
          const record = await this.masters.createFamily({ code: draft.code, name: draft.name, description: draft.description, sortOrder: draft.sortOrder }, masterActor);
          familyIds.set(draft.code, record.id);
          bump('families');
        });
      }
      for (const item of prepared.plan.products) {
        const familyId = item.familyId ?? familyIds.get(item.draft.familyCode) ?? (await this.lookup.findFamilies([item.draft.familyCode]))[0]?.id;
        if (!familyId) {
          collector('products').error(item.draft.fileRow, 'family', 'UNKNOWN_REFERENCE', 'La familia no existe: su alta falló en esta misma ejecución.');
          continue;
        }
        await this.attempt(entity, collector('products'), item.draft.fileRow, async () => {
          await this.masters.createProduct({ sku: item.draft.sku, description: item.draft.description, familyId, baseUnitId: item.baseUnitId }, masterActor);
          bump('products');
        });
      }
    } else {
      for (const item of prepared.plan.projects) {
        await this.createProject(item, actor, collector('projects'), bump);
      }
    }
    return created;
  }

  private async createProject(item: ProjectPlan, actor: LoadActor, collector: SheetCollector, bump: (sheet: string) => void): Promise<void> {
    const { draft } = item;
    const created: { id: string | null } = { id: null };
    await this.attempt('projects', collector, draft.fileRow, async () => {
      const detail = await this.projects.create(actor.context, {
        name: draft.name,
        customerId: item.customerId,
        ...(item.countryId ? { countryId: item.countryId } : {}),
        city: draft.city,
        address: draft.address,
        description: draft.description,
        estimatedStartDate: draft.estimatedStartDate,
        estimatedEndDate: draft.estimatedEndDate,
        estimatedDecisionDate: draft.estimatedDecisionDate,
        ...(item.ownerId ? { ownerId: item.ownerId } : {}),
        ...(draft.code ? { code: draft.code } : {}),
      });
      created.id = detail.record.id;
    });
    if (created.id === null) return;
    if (item.projectTypeId === null && item.sectorId === null) {
      bump('projects');
      return;
    }
    try {
      await this.classification.update(actor.context, created.id, { projectTypeId: item.projectTypeId, sectorId: item.sectorId, tonnageMode: 'NONE' });
      bump('projects');
    } catch (error) {
      const failure = describeFailure('projects', error);
      // Creada pero sin clasificar: categoría propia (ni «creada» ni «con error»), con el procedimiento de reparación.
      collector.createdWithWarning(
        draft.fileRow,
        failure.column,
        'CLASSIFICATION_FAILED',
        `El proyecto se creó, pero no se pudo guardar su tipo y sector (${failure.detail}). Clasifíquelo desde la ficha del proyecto en la aplicación; volver a ejecutar la carga lo omite como «ya existe».`,
      );
    }
  }

  /** Ejecuta una creación; un rechazo del servicio queda como error de esa fila y la carga sigue. */
  private async attempt(entity: InitialDataEntity, collector: SheetCollector, fileRow: number, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      const failure = describeFailure(entity, error);
      const hint = error instanceof ResourceConflictError ? ' Puede ser un conflicto con otra carga o con otro usuario a la vez: vuelva a ejecutar la carga.' : '';
      collector.error(fileRow, failure.column, failure.code, `El sistema rechazó la fila (${failure.detail}).${hint}`);
    }
  }
}

interface Failure {
  readonly code: string;
  readonly column: string | null;
  readonly detail: string;
}

/**
 * Motivo de un rechazo del servicio sin repetir datos: el código de error y los nombres de campo
 * de `details`. Un error inesperado solo aporta el nombre de su clase (el mensaje podría contener datos).
 */
export function describeFailure(entity: InitialDataEntity, error: unknown): Failure {
  if (error instanceof ApplicationError) {
    const fields = error.details.flatMap((detail) => (typeof detail['field'] === 'string' ? [detail['field']] : []));
    const column = fields.map((field) => FIELD_COLUMNS[entity][field]).find((key): key is string => key !== undefined) ?? null;
    return { code: error.code, column, detail: fields.length > 0 ? `${error.code} en ${fields.join(', ')}` : error.code };
  }
  const name = error instanceof Error ? error.name : 'Error';
  return { code: 'CREATE_FAILED', column: null, detail: `error inesperado ${name}` };
}
