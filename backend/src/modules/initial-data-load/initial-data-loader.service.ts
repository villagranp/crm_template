import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError, ResourceConflictError } from '@/common/errors/application-error';
import { AccessService } from '@/modules/access/access.service';
import { EntraIdentityLinkService } from '@/modules/access/entra-identity-link.service';
import { UsersService } from '@/modules/access/users.service';
import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { PRODUCT_CONFIGURE_PERMISSION } from '@/modules/products/product-masters.mappers';
import { ProductMastersService } from '@/modules/products/product-masters.service';
import { isClosedStage, type OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { OPPORTUNITY_CATALOGS, OPPORTUNITY_PERMISSIONS } from '@/modules/opportunities/opportunity-constants';
import { OPPORTUNITY_ERROR_CODES } from '@/modules/opportunities/opportunity-errors';
import { reasonAppliesTo, resultIssues } from '@/modules/opportunities/opportunity-result-rules';
import { OpportunityStageService } from '@/modules/opportunities/opportunity-stage.service';
import { planStageChange, type StageItem, type StageTransitionMap } from '@/modules/opportunities/stage-transition-policy';
import { defaultProgressOf, type ProgressRules, progressRuleIssue } from '@/modules/projects/phase-rules';
import { ProjectCatalogsService } from '@/modules/projects/project-catalogs.service';
import { ProjectClassificationService } from '@/modules/projects/project-classification.service';
import { type ProjectActor, ProjectAccessService } from '@/modules/projects/project-access.service';
import { PROJECT_CATALOGS, PROJECT_PARAMETERS, PROJECT_PERMISSIONS } from '@/modules/projects/project-constants';
import { PROJECT_ERROR_CODES } from '@/modules/projects/project-errors';
import { ProjectPhaseService } from '@/modules/projects/project-phase.service';
import { ProjectsService } from '@/modules/projects/projects.service';
import { projectRequiredFields } from '@/modules/projects/project-rules';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { isPastDate } from '@/modules/safety-minutes/safety-minute-rules';
import { SAFETY_MINUTE_CREATE_PERMISSION } from '@/modules/safety-minutes/safety-minute-permissions';
import { SafetyMinutesService } from '@/modules/safety-minutes/safety-minutes.service';

import { DEFAULT_READ_LIMITS, type LoadReadLimits, type LoadSource, type ParsedSheet, readLoadSource } from './initial-data-file-reader';
import {
  type EntraIdentityDraft,
  type UserDraft,
  type FamilyDraft,
  type LoadRow,
  type MinuteDraft,
  type OpportunityDraft,
  type ProductDraft,
  type ProjectDraft,
  sanitizeSheet,
  SheetCollector,
  validateEntraIdentityRows,
  validateUserRows,
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
  type LookupCustomer,
  type LookupCustomerByCode,
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
  // La oportunidad de cada proyecto se crea y se cierra a nombre de su responsable (ADR-031).
  projects: [PROJECT_PERMISSIONS.create, PROJECT_PERMISSIONS.administer, OPPORTUNITY_PERMISSIONS.create, OPPORTUNITY_PERMISSIONS.close, OPPORTUNITY_PERMISSIONS.administer],
  products: [PRODUCT_CONFIGURE_PERMISSION],
  'safety-minutes': [SAFETY_MINUTE_CREATE_PERMISSION],
  // Vincular una identidad es dar acceso a una cuenta: administrador (ADR-020) con permiso para editar usuarios.
  'entra-identities': ['usuarios.editar'],
  // Crear usuarios con equipo exige además el permiso de equipos (el mismo del alta por API, ADR-020).
  users: ['usuarios.crear', 'equipos.editar'],
};

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

/** Oportunidad resuelta: nace en `createStageId` (abierta) y, si `close` existe, pasa a la etapa cerrada con su resultado. */
interface OpportunityPlan {
  readonly createStageId: string;
  readonly opportunityDate: string | null;
  readonly close: {
    readonly stageId: string;
    readonly outcome: OpportunityOutcomeCode;
    readonly reasonId: string | null;
    readonly awardedPercent: string | null;
    readonly decisionDate: string;
    readonly comments: string | null;
  } | null;
}

interface ProjectPlan {
  readonly draft: ProjectDraft;
  readonly customerId: string;
  readonly countryId: string | null;
  readonly ownerId: string | null;
  readonly projectTypeId: string | null;
  readonly sectorId: string | null;
  readonly measureUnitId: string | null;
  readonly phaseId: string | null;
  readonly opportunity: OpportunityPlan | null;
}

/** Catálogos con semántica (`metadata`) que validan fase y oportunidad antes de escribir. */
interface CommercialSemantics {
  readonly phases: readonly StageItem[];
  readonly progressRules: ProgressRules;
  readonly stages: readonly StageItem[];
  readonly defaultStage: StageItem | null;
  readonly transitions: StageTransitionMap;
  readonly outcomes: readonly StageItem[];
  readonly reasons: readonly StageItem[];
}

/** Campo de una incidencia de resultado → columna de la plantilla. */
const RESULT_FIELD_COLUMNS: Readonly<Record<string, string>> = { outcome: 'result', reasonId: 'resultReason', awardedPercent: 'awardedPercent', decisionDate: 'decisionDate' };

interface ProductPlan {
  readonly draft: ProductDraft;
  readonly familyId: string | null;
  readonly baseUnitId: string;
}

interface EntraIdentityPlan {
  readonly draft: EntraIdentityDraft;
  readonly userId: string;
}

interface UserPlan {
  readonly draft: UserDraft;
  readonly countryId: string;
  readonly roleId: string;
  readonly teamId: string | null;
}

interface Plan {
  readonly users: UserPlan[];
  readonly families: FamilyDraft[];
  readonly products: ProductPlan[];
  readonly projects: ProjectPlan[];
  readonly minutes: MinuteDraft[];
  readonly identities: EntraIdentityPlan[];
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
    projectTypeId: 'projectType',
    sectorId: 'sector',
    measureUnitId: 'measureUnit',
    estimatedQuantity: 'estimatedQuantity',
    phaseId: 'phase',
    progress: 'phaseProgress',
    stageId: 'opportunityStage',
    toStageId: 'opportunityStage',
    opportunityDate: 'opportunityDate',
    'result.outcome': 'result',
    'result.reasonId': 'resultReason',
    'result.awardedPercent': 'awardedPercent',
    'result.decisionDate': 'decisionDate',
  },
  products: { code: 'code', sku: 'sku', familyId: 'family', baseUnitId: 'baseUnit' },
  'safety-minutes': { displayDate: 'displayDate', message: 'message' },
  'entra-identities': { identitySubject: 'oid' },
  users: { email: 'email', employeeCode: 'employeeCode', countryId: 'country', roleIds: 'role', teamIds: 'team' },
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
    private readonly identityLinks: EntraIdentityLinkService,
    private readonly users: UsersService,
    private readonly projectCatalogs: ProjectCatalogsService,
    private readonly phases: ProjectPhaseService,
    private readonly opportunities: OpportunitiesService,
    private readonly opportunityStages: OpportunityStageService,
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

    const prepared = await this.prepare(entity, read.sheets, actor);
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
      case 'entra-identities':
        return plan.identities.length;
      case 'users':
        return plan.users.length;
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

    let plan: Plan = { families: [], products: [], projects: [], minutes: [], identities: [], users: [] };
    if (entity === 'safety-minutes') {
      plan = { ...plan, minutes: await this.planMinutes(rows('safety-minutes'), collectorOf('safety-minutes')) };
    } else if (entity === 'users') {
      plan = { ...plan, users: await this.planUsers(rows('users'), collectorOf('users')) };
    } else if (entity === 'entra-identities') {
      plan = { ...plan, identities: await this.planEntraIdentities(rows('entra-identities'), collectorOf('entra-identities')) };
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
  // Usuarios (ADR-030)
  // -------------------------------------------------------------------------

  /**
   * Cada fila da de alta un usuario con un rol (y equipo opcional) usando el alta de usuarios de
   * Administración: nace sin vínculo con Entra ID (se vincula después por `oid`). «Ya existe» si el
   * correo ya es de un usuario; error si su código de colaborador es de otro; país, rol y equipo deben
   * existir y estar activos.
   */
  private async planUsers(rows: readonly LoadRow[], collector: SheetCollector): Promise<UserPlan[]> {
    const drafts = validateUserRows(rows, collector);
    const unique = (values: readonly (string | null)[]): string[] => [...new Set(values.filter((value): value is string => value !== null))];
    const [existing, countries, roles, teams] = await Promise.all([
      this.lookup.findUsers({ emails: unique(drafts.map((draft) => draft.email)), employeeCodes: unique(drafts.map((draft) => draft.employeeCode)) }),
      this.lookup.findCountriesByIso(unique(drafts.map((draft) => draft.country))),
      this.lookup.findRoles(unique(drafts.map((draft) => draft.role))),
      this.lookup.findTeams(unique(drafts.map((draft) => draft.team))),
    ]);
    const userByEmail = new Map(existing.map((user) => [user.email, user]));
    const userByCode = new Map(existing.flatMap((user) => (user.employeeCode ? [[user.employeeCode.toUpperCase(), user] as const] : [])));
    const countryByIso = new Map(countries.map((country) => [country.code.toUpperCase(), country]));
    const roleByCode = new Map(roles.map((role) => [role.code.toLowerCase(), role]));
    const teamByCode = new Map(teams.map((team) => [team.code.toUpperCase(), team]));

    const planned: UserPlan[] = [];
    for (const draft of drafts) {
      if (userByEmail.has(draft.email)) {
        collector.exists(draft.fileRow, 'email', 'Ya existe un usuario con ese correo; no se modifica.');
        continue;
      }
      let ok = true;
      if (userByCode.has(draft.employeeCode)) {
        collector.error(draft.fileRow, 'employeeCode', 'EMPLOYEE_CODE_TAKEN', 'Ese código de colaborador ya es de otro usuario.');
        ok = false;
      }
      const country = countryByIso.get(draft.country);
      if (!country) {
        collector.error(draft.fileRow, 'country', 'UNKNOWN_REFERENCE', 'El país no existe: use un código ISO de un país activo.');
        ok = false;
      } else if (!country.isActive) {
        collector.error(draft.fileRow, 'country', 'INACTIVE_REFERENCE', 'El país está inactivo.');
        ok = false;
      }
      const role = roleByCode.get(draft.role);
      if (!role) {
        collector.error(draft.fileRow, 'role', 'UNKNOWN_REFERENCE', 'El rol no existe: use el código de un rol activo.');
        ok = false;
      } else if (!role.isActive) {
        collector.error(draft.fileRow, 'role', 'INACTIVE_REFERENCE', 'El rol está inactivo.');
        ok = false;
      }
      const team = draft.team === null ? null : (teamByCode.get(draft.team) ?? null);
      if (draft.team !== null && !team) {
        collector.error(draft.fileRow, 'team', 'UNKNOWN_REFERENCE', 'El equipo no existe: use el código de un equipo activo.');
        ok = false;
      } else if (team && !team.isActive) {
        collector.error(draft.fileRow, 'team', 'INACTIVE_REFERENCE', 'El equipo está inactivo.');
        ok = false;
      }
      if (ok && country && role) planned.push({ draft, countryId: country.id, roleId: role.id, teamId: team?.id ?? null });
    }
    return planned;
  }

  // -------------------------------------------------------------------------
  // Vínculos con Entra ID (ADR-027)
  // -------------------------------------------------------------------------

  /**
   * Cada fila vincula un usuario existente (y no eliminado) con un `oid`. «Ya existe» si ese usuario ya
   * tiene ese mismo `oid`; error si el `oid` ya es de otro usuario; advertencia `EXISTS_DIFFERENT` (y se
   * omite, sin modificar) si el usuario ya tiene otro `oid`. Nunca se vincula por correo coincidente.
   */
  private async planEntraIdentities(rows: readonly LoadRow[], collector: SheetCollector): Promise<EntraIdentityPlan[]> {
    const drafts = validateEntraIdentityRows(rows, collector);
    const unique = <T>(values: readonly (T | null)[]): T[] => [...new Set(values.filter((value): value is T => value !== null))];
    const users = await this.lookup.findUsers({
      emails: unique(drafts.map((draft) => (draft.user.kind === 'email' ? draft.user.value : null))),
      employeeCodes: unique(drafts.map((draft) => (draft.user.kind === 'employeeCode' ? draft.user.value : null))),
    });
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const userByCode = new Map(users.flatMap((user) => (user.employeeCode ? [[user.employeeCode, user] as const] : [])));

    const resolved: EntraIdentityPlan[] = [];
    for (const draft of drafts) {
      const user: LookupUser | undefined = draft.user.kind === 'email' ? userByEmail.get(draft.user.value) : userByCode.get(draft.user.value);
      if (!user) collector.error(draft.fileRow, 'user', 'UNKNOWN_REFERENCE', 'No existe un usuario con ese correo o código de colaborador.');
      else if (user.isDeleted) collector.error(draft.fileRow, 'user', 'INACTIVE_REFERENCE', 'El usuario está eliminado.');
      else resolved.push({ draft, userId: user.id });
    }

    // Dos referencias distintas (correo y código) pueden ser el mismo usuario.
    const rowsOfUser = new Map<string, number[]>();
    for (const item of resolved) rowsOfUser.set(item.userId, [...(rowsOfUser.get(item.userId) ?? []), item.draft.fileRow]);
    const clean = resolved.filter((item) => {
      const sameUser = rowsOfUser.get(item.userId) ?? [];
      if (sameUser.length < 2) return true;
      const other = sameUser.find((fileRow) => fileRow !== item.draft.fileRow);
      collector.error(item.draft.fileRow, 'user', 'DUPLICATE_IN_FILE', `El usuario se repite en la fila ${other} del archivo (con otra referencia).`);
      return false;
    });

    const identities = await this.lookup.findEntraIdentities({ subjects: clean.map((item) => item.draft.oid), userIds: clean.map((item) => item.userId) });
    const ownerOfSubject = new Map(identities.map((identity) => [identity.subject, identity.userId]));
    const subjectsOfUser = new Map<string, string[]>();
    for (const identity of identities) subjectsOfUser.set(identity.userId, [...(subjectsOfUser.get(identity.userId) ?? []), identity.subject]);

    const planned: EntraIdentityPlan[] = [];
    for (const item of clean) {
      const owner = ownerOfSubject.get(item.draft.oid);
      if (owner !== undefined && owner !== item.userId) {
        collector.error(item.draft.fileRow, 'oid', 'IDENTITY_TAKEN', 'Ese Object ID ya está vinculado a otro usuario.');
      } else if (owner === item.userId) {
        collector.exists(item.draft.fileRow, 'oid', 'El usuario ya está vinculado con ese Object ID; no se modifica.');
      } else if ((subjectsOfUser.get(item.userId) ?? []).length > 0) {
        collector.existsDifferent(item.draft.fileRow, 'oid', 'El usuario ya está vinculado con otro Object ID; se omite sin modificarlo.');
      } else {
        planned.push(item);
      }
    }

    // Vincular una identidad a una cuenta de administrador es el vínculo más delicado: quien controle ese
    // `oid` entra con todos los permisos. No bloquea, pero el informe lo pone delante (ADR-027).
    let administrators = 0;
    for (const item of planned) {
      if (await this.access.isAdministrador(item.userId)) {
        administrators += 1;
        collector.note(item.draft.fileRow, 'oid', 'LINKS_TO_ADMINISTRATOR', 'El usuario tiene el rol de administrador: confirme que este Object ID es el suyo antes de aplicar.');
      }
    }
    if (administrators > 0) {
      collector.note(null, null, 'ADMINISTRATOR_ROWS', `${administrators} fila(s) vinculan a usuarios con rol de administrador: revíselas (cada una está señalada en su fila).`);
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
    const [customers, coded, countries, types, sectors, units, users, semantics] = await Promise.all([
      this.lookup.findCustomersByCrmCode(unique(drafts.map((draft) => draft.customerCrmCode))),
      this.lookup.findCustomersByCustomerCode(unique(drafts.map((draft) => draft.customerCode))),
      this.lookup.findCountriesByIso(unique(drafts.map((draft) => draft.countryIso))),
      this.lookup.findCatalogItems(PROJECT_CATALOGS.projectType, unique(drafts.map((draft) => draft.projectTypeCode))),
      this.lookup.findCatalogItems(PROJECT_CATALOGS.sector, unique(drafts.map((draft) => draft.sectorCode))),
      this.lookup.findUnits(unique(drafts.map((draft) => draft.measureUnitCode))),
      this.lookup.findUsers({
        emails: unique(ownerRefs.map((owner) => (owner.kind === 'email' ? owner.value : null))),
        employeeCodes: unique(ownerRefs.map((owner) => (owner.kind === 'employeeCode' ? owner.value : null))),
      }),
      this.commercialSemantics(drafts),
    ]);
    const customerByCode = new Map(customers.map((customer) => [customer.crmCode.toUpperCase(), customer]));
    const customersByCustomerCode = new Map<string, LookupCustomerByCode[]>();
    for (const customer of coded) customersByCustomerCode.set(customer.customerCode, [...(customersByCustomerCode.get(customer.customerCode) ?? []), customer]);
    const countryByIso = new Map(countries.map((country) => [country.code.toUpperCase(), country]));
    const typeByCode = new Map(types.map((item) => [item.code.toUpperCase(), item]));
    const sectorByCode = new Map(sectors.map((item) => [item.code.toUpperCase(), item]));
    const unitByCode = new Map(units.map((item) => [item.code.toUpperCase(), item]));
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const userByCode = new Map(users.flatMap((user) => (user.employeeCode ? [[user.employeeCode, user] as const] : [])));

    const referenced = (
      draft: ProjectDraft,
      key: 'country' | 'projectType' | 'sector' | 'measureUnit',
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

    const resolveCustomer = (draft: ProjectDraft): LookupCustomer | undefined => {
      if (draft.customerCrmCode !== null) {
        const customer = customerByCode.get(draft.customerCrmCode);
        if (!customer) collector.error(draft.fileRow, 'customerCrmCode', 'UNKNOWN_REFERENCE', 'No existe un cliente con ese código CRM.');
        return customer;
      }
      // Código de cliente: único por país (ADR-031); con varios países, decide la columna País.
      const matches = (customersByCustomerCode.get(draft.customerCode ?? '') ?? []).filter((customer) => draft.countryIso === null || customer.countryIso === draft.countryIso);
      if (matches.length === 0) {
        collector.error(draft.fileRow, 'customerCode', 'UNKNOWN_REFERENCE', draft.countryIso === null ? 'No existe un cliente con ese código de cliente.' : 'No existe un cliente con ese código de cliente en ese país.');
      } else if (matches.length > 1) {
        collector.error(draft.fileRow, 'customerCode', 'AMBIGUOUS_REFERENCE', 'Hay clientes con ese código en varios países: indique el País.');
      }
      return matches.length === 1 ? matches[0] : undefined;
    };

    const resolved = drafts.map((draft): ProjectPlan => {
      const customer = resolveCustomer(draft);
      if (customer?.isDeleted) collector.error(draft.fileRow, customerColumn(draft), 'INACTIVE_REFERENCE', 'El cliente está eliminado.');
      const countryId = referenced(draft, 'country', draft.countryIso, countryByIso, 'El país');
      const projectTypeId = referenced(draft, 'projectType', draft.projectTypeCode, typeByCode, 'El tipo de proyecto');
      const sectorId = referenced(draft, 'sector', draft.sectorCode, sectorByCode, 'El sector');
      const measureUnitId = referenced(draft, 'measureUnit', draft.measureUnitCode, unitByCode, 'La unidad de medida');
      let ownerId: string | null = null;
      if (draft.owner) {
        const owner: LookupUser | undefined = draft.owner.kind === 'email' ? userByEmail.get(draft.owner.value) : userByCode.get(draft.owner.value);
        if (!owner) collector.error(draft.fileRow, 'owner', 'UNKNOWN_REFERENCE', 'No existe un usuario con ese correo o código de colaborador.');
        else if (owner.isDeleted || owner.status !== 'ACTIVE') collector.error(draft.fileRow, 'owner', 'INACTIVE_REFERENCE', 'El responsable no es un usuario activo.');
        else ownerId = owner.id;
      }
      const phaseId = this.resolvePhase(draft, semantics, collector);
      const opportunity = this.resolveOpportunity(draft.fileRow, draft.opportunity, semantics, collector);
      return { draft, customerId: customer?.id ?? '', countryId, ownerId, projectTypeId, sectorId, measureUnitId, phaseId, opportunity };
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
    const pending: ProjectPlan[] = [];
    for (const item of unmatched) {
      for (const field of required.general) {
        const column = GENERAL_FIELD_COLUMNS[field];
        if (column && item.draft[column] === null) {
          collector.error(item.draft.fileRow, column, 'REQUIRED_FIELD_MISSING', 'El campo es obligatorio según la parametrización de campos obligatorios de proyectos.');
        }
      }
      if (classifies(item.draft)) {
        for (const [field, column, value] of [
          ['projectTypeId', 'projectType', item.draft.projectTypeCode],
          ['sectorId', 'sector', item.draft.sectorCode],
          ['measureUnitId', 'measureUnit', item.draft.measureUnitCode],
          ['estimatedQuantity', 'estimatedQuantity', item.draft.estimatedQuantity],
        ] as const) {
          if (required.classification.includes(field) && value === null) {
            collector.error(item.draft.fileRow, column, 'REQUIRED_FIELD_MISSING', 'El campo es obligatorio al clasificar el proyecto (parametrización de campos obligatorios).');
          }
        }
      }
      if (!collector.hasError(item.draft.fileRow)) pending.push(item);
    }

    return actor ? this.preflightProjects(pending, collector, actor) : pending;
  }

  /** Lee los catálogos con semántica solo si alguna fila trae fase u oportunidad. */
  private async commercialSemantics(drafts: readonly ProjectDraft[]): Promise<CommercialSemantics> {
    const needsPhase = drafts.some((draft) => draft.phaseCode !== null);
    const needsOpportunity = drafts.some((draft) => draft.opportunity !== null);
    const [phases, progressRules, stages, defaultStage, transitions, outcomes, reasons] = await Promise.all([
      needsPhase ? this.projectCatalogs.items(PROJECT_CATALOGS.phase) : [],
      needsPhase ? this.parameters.get<ProgressRules>(PROJECT_PARAMETERS.progressRules) : {},
      needsOpportunity ? this.opportunities.stages() : [],
      needsOpportunity ? this.opportunities.defaultStage() : null,
      needsOpportunity ? this.opportunities.transitionMap() : {},
      needsOpportunity ? this.projectCatalogs.items(OPPORTUNITY_CATALOGS.outcome) : [],
      needsOpportunity ? this.projectCatalogs.items(OPPORTUNITY_CATALOGS.reason) : [],
    ]);
    return { phases, progressRules: progressRules ?? {}, stages, defaultStage, transitions: transitions ?? {}, outcomes, reasons };
  }

  /** Fase activa y regla de avance (`crm.proyectos.reglas_avance`) con el avance que aplicará el servicio. */
  private resolvePhase(draft: ProjectDraft, semantics: CommercialSemantics, collector: SheetCollector): string | null {
    if (draft.phaseCode === null) return null;
    const phase = semantics.phases.find((item) => item.code.toUpperCase() === draft.phaseCode);
    if (!phase) {
      collector.error(draft.fileRow, 'phase', 'UNKNOWN_REFERENCE', 'La fase del cliente no existe.');
      return null;
    }
    if (!phase.isActive) {
      collector.error(draft.fileRow, 'phase', 'INACTIVE_REFERENCE', 'La fase del cliente está inactiva.');
      return null;
    }
    // Sin avance en la fila, el servicio usa el de la fase destino o, sin él, el actual (0 en un proyecto nuevo).
    const progress = draft.phaseProgress ?? defaultProgressOf(phase.metadata as Record<string, unknown> | null) ?? '0';
    if (progressRuleIssue(phase.code, progress, semantics.progressRules)) {
      collector.error(draft.fileRow, 'phaseProgress', PROJECT_ERROR_CODES.phaseProgressRule, 'El avance es menor que el mínimo que exige la fase (parametrización de reglas de avance).');
      return null;
    }
    return phase.id;
  }

  /**
   * Etapa activa; una abierta no admite resultado. Una cerrada exige resultado, debe alcanzarse desde la
   * etapa inicial con el mapa de transiciones y el resultado debe cumplir sus reglas (RN-03.47–RN-03.50).
   */
  private resolveOpportunity(fileRow: number, draft: OpportunityDraft | null, semantics: CommercialSemantics, collector: SheetCollector): OpportunityPlan | null {
    if (draft === null) return null;
    const stage = semantics.stages.find((item) => item.code.toUpperCase() === draft.stageCode);
    if (!stage) {
      collector.error(fileRow, 'opportunityStage', 'UNKNOWN_REFERENCE', 'La etapa de oportunidad no existe.');
      return null;
    }
    if (!stage.isActive) {
      collector.error(fileRow, 'opportunityStage', 'INACTIVE_REFERENCE', 'La etapa de oportunidad está inactiva.');
      return null;
    }
    if (!isClosedStage(stage)) {
      if (draft.result !== null) collector.error(fileRow, 'result', OPPORTUNITY_ERROR_CODES.resultNotAllowed, 'Una etapa abierta no admite resultado.');
      return { createStageId: stage.id, opportunityDate: draft.opportunityDate, close: null };
    }
    if (draft.result === null) {
      collector.error(fileRow, 'result', OPPORTUNITY_ERROR_CODES.resultRequired, 'Una etapa cerrada exige el resultado.');
      return null;
    }
    const initial = semantics.defaultStage;
    if (initial === null) throw new Error('Default opportunity stage not loaded');
    const transition = planStageChange(
      { from: initial, to: stage, hasComment: false, hasResult: true, currentResult: false, canClose: true, canReopen: true },
      semantics.stages,
      semantics.transitions,
    );
    if (transition.kind === 'REJECT') {
      collector.error(fileRow, 'opportunityStage', OPPORTUNITY_ERROR_CODES.invalidStageTransition, `La etapa no se puede alcanzar desde la etapa inicial (${initial.code}) con las transiciones parametrizadas.`);
      return null;
    }
    const result = draft.result;
    let reasonId: string | null = null;
    if (result.reasonCode !== null) {
      const reason = semantics.reasons.find((item) => item.code.toUpperCase() === result.reasonCode);
      if (!reason) collector.error(fileRow, 'resultReason', 'UNKNOWN_REFERENCE', 'El motivo del resultado no existe.');
      else if (!reason.isActive) collector.error(fileRow, 'resultReason', 'INACTIVE_REFERENCE', 'El motivo del resultado está inactivo.');
      else if (!reasonAppliesTo(reason).includes(result.outcome)) collector.error(fileRow, 'resultReason', 'REASON_NOT_APPLICABLE', 'El motivo no aplica a ese resultado.');
      else reasonId = reason.id;
    }
    const input = { outcome: result.outcome, reasonId, awardedPercent: result.awardedPercent, decisionDate: result.decisionDate, comments: result.comments };
    for (const issue of resultIssues(input, stage, semantics.outcomes)) {
      // Un motivo escrito pero inválido ya tiene su error: no se repite como «falta el motivo».
      if (issue.field === 'reasonId' && result.reasonCode !== null) continue;
      collector.error(fileRow, RESULT_FIELD_COLUMNS[issue.field] ?? 'result', issue.code, resultIssueMessage(issue.code));
    }
    return {
      createStageId: initial.id,
      opportunityDate: draft.opportunityDate,
      close: { stageId: stage.id, outcome: result.outcome, reasonId, awardedPercent: result.awardedPercent, decisionDate: result.decisionDate, comments: result.comments },
    };
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
      if (!usable) collector.error(item.draft.fileRow, customerColumn(item.draft), 'CUSTOMER_NOT_USABLE', 'El cliente no está activo o el actor no puede verlo.');

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
    } else if (entity === 'users') {
      for (const item of prepared.plan.users) {
        await this.attempt(entity, collector('users'), item.draft.fileRow, async () => {
          await this.users.create(
            {
              email: item.draft.email,
              firstName: item.draft.firstName,
              lastName: item.draft.lastName,
              employeeCode: item.draft.employeeCode,
              countryId: item.countryId,
              roleIds: [item.roleId],
              teamIds: item.teamId ? [item.teamId] : [],
            },
            masterActor,
          );
          bump('users');
        });
      }
    } else if (entity === 'entra-identities') {
      for (const item of prepared.plan.identities) {
        await this.attempt(entity, collector('entra-identities'), item.draft.fileRow, async () => {
          const outcome = await this.identityLinks.link(item.userId, item.draft.oid, actor.context.audit);
          if (outcome.kind === 'linked') bump('entra-identities');
          else if (outcome.kind === 'already_linked') collector('entra-identities').exists(item.draft.fileRow, 'oid', 'El usuario ya está vinculado con ese Object ID; no se modifica.');
          else collector('entra-identities').error(item.draft.fileRow, 'oid', 'IDENTITY_TAKEN', 'Ese Object ID ya está vinculado a otro usuario (otra carga a la vez).');
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

  /**
   * Crea el proyecto y, sobre él, los pasos de la fila (ADR-031): clasificación, fase del cliente y
   * oportunidad (alta en su etapa abierta o, si es cerrada, alta en la inicial y cierre con su resultado).
   * Un fallo en un paso posterior deja el proyecto creado y la fila «creada con advertencia» con el paso
   * que hay que completar a mano; los demás pasos se intentan igual.
   */
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
    const projectId = created.id;
    if (projectId === null) return;

    let warned = false;
    const step = async (code: string, repair: string, work: () => Promise<void>): Promise<void> => {
      try {
        await work();
      } catch (error) {
        warned = true;
        const failure = describeFailure('projects', error);
        collector.createdWithWarning(
          draft.fileRow,
          failure.column,
          code,
          `El proyecto se creó, pero ${repair} (${failure.detail}). Complételo desde la ficha del proyecto en la aplicación; volver a ejecutar la carga lo omite como «ya existe».`,
        );
      }
    };

    if (classifies(draft)) {
      await step('CLASSIFICATION_FAILED', 'no se pudo guardar su clasificación (tipo, sector, unidad o cantidad)', async () => {
        await this.classification.update(actor.context, projectId, {
          projectTypeId: item.projectTypeId,
          sectorId: item.sectorId,
          ...(item.measureUnitId !== null ? { measureUnitId: item.measureUnitId } : {}),
          ...(draft.estimatedQuantity !== null ? { estimatedQuantity: draft.estimatedQuantity } : {}),
          tonnageMode: 'NONE',
        });
      });
    }
    if (item.phaseId !== null) {
      const phaseId = item.phaseId;
      await step('PHASE_FAILED', 'no se pudo guardar su fase del cliente', async () => {
        try {
          await this.phases.change(actor.context, projectId, {
            phaseId,
            ...(draft.phaseProgress !== null ? { progress: draft.phaseProgress } : {}),
            comment: draft.phaseComment,
          });
        } catch (error) {
          // La fase y el avance ya son los del proyecto recién creado: no hay nada que cambiar.
          if (error instanceof ApplicationError && error.code === PROJECT_ERROR_CODES.phaseUnchanged) return;
          throw error;
        }
      });
    }
    if (item.opportunity !== null) {
      await this.createOpportunity(projectId, item.opportunity, item.ownerId ?? actor.userId, actor, step);
    }
    if (!warned) bump('projects');
  }

  private async createOpportunity(
    projectId: string,
    plan: OpportunityPlan,
    ownerId: string,
    actor: LoadActor,
    step: (code: string, repair: string, work: () => Promise<void>) => Promise<void>,
  ): Promise<void> {
    let opportunityId: string | null = null;
    await step('OPPORTUNITY_FAILED', 'no se pudo crear su oportunidad', async () => {
      const view = await this.opportunities.create(actor.context, projectId, {
        stageId: plan.createStageId,
        ownerId,
        ...(plan.opportunityDate !== null ? { opportunityDate: plan.opportunityDate } : {}),
      });
      opportunityId = view.record.id;
    });
    const close = plan.close;
    if (opportunityId === null || close === null) return;
    const id: string = opportunityId;
    await step('RESULT_FAILED', 'su oportunidad quedó abierta: no se pudo registrar la etapa cerrada y el resultado', async () => {
      await this.opportunityStages.changeStage(actor.context, id, {
        toStageId: close.stageId,
        result: { outcome: close.outcome, reasonId: close.reasonId, awardedPercent: close.awardedPercent, decisionDate: close.decisionDate, comments: close.comments },
      });
    });
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

/** Columna con la que la fila identifica al cliente (código CRM o código de cliente). */
function customerColumn(draft: ProjectDraft): 'customerCrmCode' | 'customerCode' {
  return draft.customerCrmCode !== null ? 'customerCrmCode' : 'customerCode';
}

/** La fila trae algo de la clasificación del proyecto. */
function classifies(draft: ProjectDraft): boolean {
  return draft.projectTypeCode !== null || draft.sectorCode !== null || draft.measureUnitCode !== null || draft.estimatedQuantity !== null;
}

/** Mensaje de una incidencia de resultado (sin repetir valores de celdas). */
function resultIssueMessage(code: string): string {
  switch (code) {
    case OPPORTUNITY_ERROR_CODES.resultStageMismatch:
      return 'El resultado no corresponde a la etapa (una etapa ganada admite WON o PARTIAL; una perdida, LOST).';
    case OPPORTUNITY_ERROR_CODES.resultReasonRequired:
      return 'El resultado exige el motivo.';
    case OPPORTUNITY_ERROR_CODES.resultPercentRequired:
      return 'El resultado PARTIAL exige el porcentaje adjudicado.';
    case OPPORTUNITY_ERROR_CODES.resultPercentNotAllowed:
      return 'El porcentaje adjudicado solo se admite con PARTIAL.';
    default:
      return 'El resultado no es válido para la etapa.';
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
