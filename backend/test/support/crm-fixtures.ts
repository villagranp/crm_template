import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { withParameterLock } from './parameter-lock';
import { accessTokenFor, createTestUser, type TestContext, type TestUser, uniqueIp } from './test-app';

/**
 * Ayudantes de las pruebas de integración del CRM (02 L.4): usuarios con país y
 * equipo, países de prueba aislados, clientes, contactos y registros mínimos de
 * proyectos, actividades, visitas y participaciones para probar visibilidad,
 * herencia y bloqueos.
 *
 * Los archivos corren en paralelo sobre el mismo esquema: todo se crea con claves
 * únicas y las pruebas comparan por pertenencia, nunca por totales globales.
 */

export interface CrmUser extends TestUser {
  token: string;
}

export interface ApiClient {
  get(path: string): request.Test;
  post(path: string): request.Test;
  patch(path: string): request.Test;
  put(path: string): request.Test;
  delete(path: string): request.Test;
}

/** Cliente HTTP con token y una IP distinta por petición (el límite de tasa es por IP). */
export function api(context: TestContext, token?: string): ApiClient {
  const server = context.app.getHttpServer();
  const prepare = (test: request.Test): request.Test => {
    const withIp = test.set('X-Forwarded-For', uniqueIp());
    return token ? withIp.set('Authorization', `Bearer ${token}`) : withIp;
  };
  return {
    get: (path: string) => prepare(request(server).get(`/api/v1${path}`)),
    post: (path: string) => prepare(request(server).post(`/api/v1${path}`)),
    patch: (path: string) => prepare(request(server).patch(`/api/v1${path}`)),
    put: (path: string) => prepare(request(server).put(`/api/v1${path}`)),
    delete: (path: string) => prepare(request(server).delete(`/api/v1${path}`)),
  };
}

export interface CrmUserOptions {
  roleCodes?: string[];
  countryId?: string | null;
  status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  /** Excepciones directas de permiso (ADR-018). */
  grant?: string[];
  deny?: string[];
  employeeCode?: string | null;
  displayName?: string;
}

/** Usuario con roles, país opcional y excepciones directas, con sesión iniciada. */
export async function crmUser(context: TestContext, options: CrmUserOptions = {}): Promise<CrmUser> {
  const user = await createTestUser(context.prisma, { roleCodes: options.roleCodes ?? ['asesor'] });
  await context.prisma.user.update({
    where: { id: user.id },
    data: {
      countryId: options.countryId ?? null,
      employeeCode: options.employeeCode ?? null,
      ...(options.displayName ? { displayName: options.displayName } : {}),
    },
  });
  for (const [effect, codes] of [
    ['GRANT', options.grant ?? []],
    ['DENY', options.deny ?? []],
  ] as const) {
    for (const code of codes) {
      const permission = await context.prisma.permission.findUniqueOrThrow({ where: { code } });
      await context.prisma.userPermission.create({
        data: { userId: user.id, permissionId: permission.id, effect, reason: 'prueba de integración' },
      });
    }
  }
  const token = await accessTokenFor(context.app, user);
  if (options.status && options.status !== 'ACTIVE') {
    await context.prisma.user.update({ where: { id: user.id }, data: { status: options.status } });
  }
  return { ...user, token };
}

/**
 * País de prueba propio de un archivo (los países reales los comparten todas las
 * suites). `isoCode` de dos caracteres poco probables (`Q1`, `Q2`…).
 */
export async function testCountry(
  prisma: PrismaClient,
  isoCode: string,
  options: { phonePattern?: string | null; taxIdPattern?: string | null; isActive?: boolean; name?: string; currencyCode?: string } = {},
): Promise<string> {
  const data = {
    name: options.name ?? `País de prueba ${isoCode}`,
    // Moneda local del país (FK a `currencies`, ADR-024); por defecto la base.
    currencyCode: options.currencyCode ?? 'USD',
    taxIdLabel: 'NIT',
    phonePattern: options.phonePattern ?? null,
    taxIdPattern: options.taxIdPattern ?? null,
    isActive: options.isActive ?? true,
    sortOrder: 900,
  };
  const country = await prisma.country.upsert({ where: { isoCode }, create: { isoCode, ...data }, update: data });
  return country.id;
}

export async function countryId(prisma: PrismaClient, isoCode: string): Promise<string> {
  return (await prisma.country.findUniqueOrThrow({ where: { isoCode } })).id;
}

export async function catalogItemId(prisma: PrismaClient, catalogKey: string, code: string): Promise<string> {
  const item = await prisma.catalogItem.findFirstOrThrow({ where: { code, catalog: { key: catalogKey } } });
  return item.id;
}

export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

export interface InsertCustomerOptions {
  salesOwnerId: string;
  countryId: string;
  statusCode?: string;
  legalName?: string;
  tradeName?: string | null;
  taxId?: string | null;
  customerCode?: string | null;
  city?: string | null;
  deletedAt?: Date | null;
}

/** Inserta un cliente directamente (sin la API ni sus validaciones), con código CRM de prueba. */
export async function insertCustomer(prisma: PrismaClient, options: InsertCustomerOptions): Promise<{ id: string; crmCode: string; legalName: string }> {
  const suffix = uniqueSuffix();
  const legalName = options.legalName ?? `Cliente de prueba ${suffix}`;
  const taxId = options.taxId ?? null;
  const customerCode = options.customerCode ?? null;
  const customer = await prisma.customer.create({
    data: {
      crmCode: `TEST-CLI-${suffix}`,
      legalName,
      legalNameNormalized: legalName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
      tradeName: options.tradeName ?? null,
      taxId,
      taxIdNormalized: taxId ? taxId.replace(/[\s.-]+/g, '').toUpperCase() : null,
      customerCode,
      customerCodeNormalized: customerCode ? customerCode.replace(/[\s-]+/g, '').toUpperCase() : null,
      city: options.city ?? null,
      countryId: options.countryId,
      statusId: await catalogItemId(prisma, 'crm.estado_cliente', options.statusCode ?? 'ACTIVO'),
      salesOwnerId: options.salesOwnerId,
      deletedAt: options.deletedAt ?? null,
    },
  });
  return { id: customer.id, crmCode: customer.crmCode, legalName };
}

export async function insertContact(
  prisma: PrismaClient,
  options: { customerId: string; firstName?: string; lastName?: string; email?: string | null; phone?: string | null; isActive?: boolean },
): Promise<string> {
  const email = options.email ?? null;
  const contact = await prisma.contact.create({
    data: {
      customerId: options.customerId,
      firstName: options.firstName ?? 'Contacto',
      lastName: options.lastName ?? `Prueba ${uniqueSuffix()}`,
      email,
      emailNormalized: email ? email.trim().toLowerCase() : null,
      phone: options.phone ?? null,
      isActive: options.isActive ?? true,
    },
  });
  return contact.id;
}

export interface InsertProjectOptions {
  customerId: string;
  ownerId: string;
  countryId: string;
  deletedAt?: Date | null;
  name?: string;
  code?: string;
  city?: string | null;
  phaseCode?: string;
  phaseProgress?: string;
  projectTypeId?: string | null;
  estimatedDecisionDate?: string | null;
  lastActivityAt?: Date;
  createdAt?: Date;
}

/**
 * Proyecto insertado directamente (sin la API): herencia de visibilidad y dependencias
 * (02 RN-02.18, RN-02.22) y datos de partida de las pruebas del Módulo 3. Fechas de
 * calendario como `YYYY-MM-DD`.
 */
export async function insertProject(prisma: PrismaClient, options: InsertProjectOptions): Promise<string> {
  const project = await prisma.project.create({
    data: {
      code: options.code ?? `TEST-PRY-${uniqueSuffix()}`,
      name: options.name ?? 'Proyecto de prueba',
      customerId: options.customerId,
      ownerId: options.ownerId,
      countryId: options.countryId,
      city: options.city ?? null,
      phaseId: await catalogItemId(prisma, 'crm.fase_cliente', options.phaseCode ?? 'DISENO'),
      phaseProgress: options.phaseProgress ?? '0',
      projectTypeId: options.projectTypeId ?? null,
      estimatedDecisionDate: options.estimatedDecisionDate ? new Date(`${options.estimatedDecisionDate}T00:00:00.000Z`) : null,
      ...(options.lastActivityAt ? { lastActivityAt: options.lastActivityAt } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      deletedAt: options.deletedAt ?? null,
    },
  });
  return project.id;
}

export interface InsertOpportunityOptions {
  projectId: string;
  ownerId: string;
  stageCode?: string;
  /** Resultado vigente (solo para etapas cerradas). `LOST` usa el primer motivo del catálogo. */
  outcome?: 'WON' | 'LOST' | 'PARTIAL' | null;
  deletedAt?: Date | null;
  /** Fecha de decisión del resultado (`YYYY-MM-DD`); por defecto 2026-10-05. */
  decisionDate?: string;
  awardedPercent?: string;
  estimatedTonnage?: string | null;
  estimatedAmountUsd?: string | null;
  /** Monto en moneda local (con `currencyCode` distinto de USD); por defecto, el de USD. */
  estimatedAmount?: string;
  currencyCode?: string;
  exchangeRate?: string;
  nextAction?: string | null;
  stageChangedAt?: Date;
}

/** Oportunidad mínima (con su resultado si se indica), insertada sin la API. */
export async function insertOpportunity(prisma: PrismaClient, options: InsertOpportunityOptions): Promise<string> {
  const opportunity = await prisma.opportunity.create({
    data: {
      code: `TEST-OPO-${uniqueSuffix()}`,
      projectId: options.projectId,
      ownerId: options.ownerId,
      stageId: await catalogItemId(prisma, 'crm.etapa_oportunidad', options.stageCode ?? 'CONTACTADO'),
      opportunityDate: new Date('2026-10-01T00:00:00.000Z'),
      deletedAt: options.deletedAt ?? null,
      estimatedTonnage: options.estimatedTonnage ?? null,
      estimatedAmountUsd: options.estimatedAmountUsd ?? null,
      // ck_opportunities_amount_set: monto, moneda, tasa y equivalente en USD van juntos.
      ...(options.estimatedAmountUsd
        ? {
            estimatedAmount: options.estimatedAmount ?? options.estimatedAmountUsd,
            currencyCode: options.currencyCode ?? 'USD',
            exchangeRate: options.exchangeRate ?? '1',
            ...((options.currencyCode ?? 'USD') !== 'USD' ? { exchangeRateDate: new Date('2026-10-01T00:00:00.000Z') } : {}),
          }
        : {}),
      nextAction: options.nextAction ?? null,
      ...(options.stageChangedAt ? { stageChangedAt: options.stageChangedAt } : {}),
    },
  });
  if (options.outcome) {
    const reason =
      options.outcome === 'LOST'
        ? await prisma.catalogItem.findFirstOrThrow({ where: { catalog: { key: 'crm.motivo_resultado' } }, orderBy: { sortOrder: 'asc' } })
        : null;
    await prisma.opportunityResult.create({
      data: {
        opportunityId: opportunity.id,
        outcome: options.outcome,
        reasonId: reason?.id ?? null,
        awardedPercent: options.outcome === 'PARTIAL' ? (options.awardedPercent ?? '60') : null,
        decisionDate: new Date(`${options.decisionDate ?? '2026-10-05'}T00:00:00.000Z`),
        recordedById: options.ownerId,
      },
    });
  }
  return opportunity.id;
}

export async function unitId(prisma: PrismaClient, code: string): Promise<string> {
  return (await prisma.unitOfMeasure.findUniqueOrThrow({ where: { code } })).id;
}

/** Unidad de prueba propia (código único), para reglas que no interfieran con otras suites. */
export async function insertUnit(
  prisma: PrismaClient,
  options: { dimension?: 'MASS' | 'LENGTH' | 'AREA' | 'VOLUME' | 'COUNT' | 'OTHER'; isActive?: boolean } = {},
): Promise<{ id: string; code: string }> {
  const code = `T${uniqueSuffix()}`;
  const unit = await prisma.unitOfMeasure.create({
    data: {
      code,
      name: `Unidad ${code}`,
      symbol: code.toLowerCase(),
      dimension: options.dimension ?? 'COUNT',
      isActive: options.isActive ?? true,
      sortOrder: 990,
    },
  });
  return { id: unit.id, code };
}

export async function insertProductFamily(prisma: PrismaClient, options: { isActive?: boolean; name?: string } = {}): Promise<string> {
  const code = `TEST-FAM-${uniqueSuffix()}`;
  const family = await prisma.productFamily.create({ data: { code, name: options.name ?? `Familia ${code}`, isActive: options.isActive ?? true } });
  return family.id;
}

export async function insertProduct(
  prisma: PrismaClient,
  options: { familyId: string; baseUnitId: string; sku?: string; description?: string; isActive?: boolean },
): Promise<{ id: string; sku: string }> {
  const sku = options.sku ?? `TEST-SKU-${uniqueSuffix()}`;
  const product = await prisma.product.create({
    data: {
      sku,
      description: options.description ?? `Producto ${sku}`,
      familyId: options.familyId,
      baseUnitId: options.baseUnitId,
      isActive: options.isActive ?? true,
    },
  });
  return { id: product.id, sku };
}

/** Regla de conversión hacia `toUnitId` (por defecto `TON`); `scopeKey` sale del ámbito. */
export async function insertConversionRule(
  prisma: PrismaClient,
  options: {
    fromUnitId: string;
    toUnitId?: string;
    factor: string;
    scope?: 'GLOBAL' | 'PRODUCT_FAMILY' | 'PRODUCT' | 'PROJECT_TYPE';
    productId?: string;
    productFamilyId?: string;
    projectTypeId?: string;
    isActive?: boolean;
  },
): Promise<string> {
  const scope = options.scope ?? 'GLOBAL';
  const scopeKey =
    scope === 'PRODUCT'
      ? options.productId
      : scope === 'PRODUCT_FAMILY'
        ? options.productFamilyId
        : scope === 'PROJECT_TYPE'
          ? options.projectTypeId
          : 'GLOBAL';
  const rule = await prisma.unitConversionRule.create({
    data: {
      fromUnitId: options.fromUnitId,
      toUnitId: options.toUnitId ?? (await unitId(prisma, 'TON')),
      factor: options.factor,
      scope,
      scopeKey: scopeKey ?? 'GLOBAL',
      productId: scope === 'PRODUCT' ? (options.productId ?? null) : null,
      productFamilyId: scope === 'PRODUCT_FAMILY' ? (options.productFamilyId ?? null) : null,
      projectTypeId: scope === 'PROJECT_TYPE' ? (options.projectTypeId ?? null) : null,
      isActive: options.isActive ?? true,
    },
  });
  return rule.id;
}

/** Asociación producto ↔ proyecto insertada sin la API (sin regla: tonelaje nulo). */
export async function insertProjectProduct(
  prisma: PrismaClient,
  options: {
    projectId: string;
    productId: string;
    unitId: string;
    quantity?: string;
    statusCode?: string;
    opportunityId?: string | null;
    deletedAt?: Date | null;
  },
): Promise<string> {
  const line = await prisma.projectProduct.create({
    data: {
      projectId: options.projectId,
      productId: options.productId,
      unitId: options.unitId,
      quantity: options.quantity ?? '10',
      opportunityId: options.opportunityId ?? null,
      statusId: await catalogItemId(prisma, 'crm.estado_producto_asociado', options.statusCode ?? 'PROPUESTO'),
      deletedAt: options.deletedAt ?? null,
    },
  });
  return line.id;
}

/** Línea de forecast insertada sin la API (sin regla: tonelaje nulo). */
export async function insertForecastLine(
  prisma: PrismaClient,
  options: { projectId: string; productId: string; unitId: string; ownerId: string; year: number; month: number; quantity?: string },
): Promise<string> {
  const line = await prisma.forecastLine.create({
    data: {
      projectId: options.projectId,
      productId: options.productId,
      unitId: options.unitId,
      ownerId: options.ownerId,
      year: options.year,
      month: options.month,
      quantity: options.quantity ?? '5',
    },
  });
  return line.id;
}

/** `{ year, month }` a `offset` meses del mes en curso en `America/Guatemala` (zona por defecto del negocio). */
export function businessMonthOffset(offset: number, now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Actividad mínima en un estado del catálogo `crm.estado_actividad` (`PENDIENTE` = abierta). */
export async function insertActivity(
  prisma: PrismaClient,
  options: {
    customerId: string;
    ownerId: string;
    statusCode?: string;
    typeCode?: string;
    priorityCode?: string;
    projectId?: string | null;
    dueAt?: Date | null;
    scheduledAt?: Date | null;
    subject?: string;
    /** Con estado `COMPLETADA`: se rellenan quién completó y las notas (ck_activities_completion). */
    completedAt?: Date | null;
    createdAt?: Date;
    deletedAt?: Date | null;
  },
): Promise<string> {
  const activity = await prisma.activity.create({
    data: {
      code: `TEST-ACT-${uniqueSuffix()}`,
      typeId: await catalogItemId(prisma, 'crm.tipo_actividad', options.typeCode ?? 'LLAMADA'),
      subject: options.subject ?? 'Actividad de prueba',
      customerId: options.customerId,
      projectId: options.projectId ?? null,
      ownerId: options.ownerId,
      statusId: await catalogItemId(prisma, 'crm.estado_actividad', options.statusCode ?? 'PENDIENTE'),
      priorityId: await catalogItemId(prisma, 'crm.prioridad', options.priorityCode ?? 'MEDIA'),
      dueAt: options.dueAt ?? null,
      scheduledAt: options.scheduledAt ?? null,
      ...(options.completedAt ? { completedAt: options.completedAt, completedById: options.ownerId, resultNotes: 'Hecho' } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      deletedAt: options.deletedAt ?? null,
    },
  });
  return activity.id;
}

/**
 * Visita mínima en un estado de `crm.estado_visita` (`PROGRAMADA` = pendiente). Por
 * defecto, mañana; los campos de realización y confirmación se informan cuando el
 * estado los exige (`ck_visits_confirm_requires`).
 */
export async function insertVisit(
  prisma: PrismaClient,
  options: {
    customerId: string;
    ownerId: string;
    statusCode?: string;
    projectId?: string | null;
    scheduledStartAt?: Date;
    scheduledEndAt?: Date | null;
    actualStartAt?: Date | null;
    resultSummary?: string | null;
    comments?: string | null;
    objective?: string;
    nextAction?: string | null;
    nextActionDate?: Date | null;
    /** Confirmada por su dueño (DM-20); sin resumen ni comentarios se rellena `confirmationSummary` (ck_visits_confirm_requires). */
    confirmedAt?: Date | null;
    reminderMinutesBefore?: number | null;
  },
): Promise<string> {
  const at = options.scheduledStartAt ?? new Date(Date.now() + 86_400_000);
  const visit = await prisma.visit.create({
    data: {
      code: `TEST-VIS-${uniqueSuffix()}`,
      customerId: options.customerId,
      projectId: options.projectId ?? null,
      ownerId: options.ownerId,
      statusId: await catalogItemId(prisma, 'crm.estado_visita', options.statusCode ?? 'PROGRAMADA'),
      scheduledStartAt: at,
      scheduledEndAt: options.scheduledEndAt ?? null,
      originalScheduledAt: at,
      objective: options.objective ?? 'Visita de prueba',
      actualStartAt: options.actualStartAt ?? null,
      resultSummary: options.resultSummary ?? null,
      comments: options.comments ?? null,
      nextAction: options.nextAction ?? null,
      nextActionDate: options.nextActionDate ?? null,
      reminderMinutesBefore: options.reminderMinutesBefore ?? null,
      confirmedAt: options.confirmedAt ?? null,
      confirmedById: options.confirmedAt ? options.ownerId : null,
      confirmationSummary: options.confirmedAt && !options.resultSummary && !options.comments ? 'Confirmada' : null,
    },
  });
  return visit.id;
}

/** Meta comercial (DM-9), insertada como la carga por script. */
export async function insertSalesTarget(
  prisma: PrismaClient,
  options: {
    metric: 'TONNAGE' | 'AMOUNT' | 'WON_OPPORTUNITIES' | 'VISITS' | 'ACTIVITIES';
    year: number;
    month?: number | null;
    userId?: string | null;
    teamId?: string | null;
    countryId?: string | null;
    targetValue: string;
  },
): Promise<string> {
  const target = await prisma.salesTarget.create({
    data: {
      metric: options.metric,
      year: options.year,
      month: options.month ?? null,
      userId: options.userId ?? null,
      teamId: options.teamId ?? null,
      countryId: options.countryId ?? null,
      targetValue: options.targetValue,
    },
  });
  return target.id;
}

export async function insertParticipant(prisma: PrismaClient, options: { activityId: string; customerId: string; contactId: string }): Promise<void> {
  await prisma.interactionParticipant.create({
    data: { activityId: options.activityId, customerId: options.customerId, contactId: options.contactId },
  });
}

/**
 * Equipo con responsable, padre y miembros opcionales (alcance TEAM con subequipos, DM-12).
 * `primaryMemberIds`: miembros cuyo equipo principal es este (vista de equipo, 03 F-14).
 */
export async function insertTeam(
  prisma: PrismaClient,
  options: { managerId?: string | null; parentId?: string | null; memberIds?: string[]; primaryMemberIds?: string[]; name?: string } = {},
): Promise<string> {
  const primary = new Set(options.primaryMemberIds ?? []);
  const members = [...new Set([...(options.memberIds ?? []), ...primary])];
  const team = await prisma.team.create({
    data: {
      code: `test-team-${uniqueSuffix().toLowerCase()}`,
      name: options.name ?? 'Equipo de prueba',
      managerId: options.managerId ?? null,
      parentId: options.parentId ?? null,
      members: { create: members.map((userId) => ({ userId, isPrimary: primary.has(userId) })) },
    },
  });
  return team.id;
}

/** Fija un parámetro y devuelve una función que restaura el valor anterior. */
export async function setParameter(prisma: PrismaClient, key: string, value: string): Promise<() => Promise<void>> {
  const original = await prisma.systemParameter.findUniqueOrThrow({ where: { key } });
  await prisma.systemParameter.update({ where: { key }, data: { value } });
  return async () => {
    await prisma.systemParameter.update({ where: { key }, data: { value: original.value } });
  };
}

/**
 * Ejecuta `work` con el parámetro fijado y lo restaura siempre. `value` puede derivarse
 * del valor vigente (p. ej. ampliar un JSON): se calcula dentro del bloqueo que
 * serializa los cambios del mismo parámetro entre suites (`parameter-lock.ts`).
 */
export async function withParameter<T>(
  prisma: PrismaClient,
  key: string,
  value: string | ((current: string) => string),
  work: () => Promise<T>,
): Promise<T> {
  return withParameterLock(key, async () => {
    const current = (await prisma.systemParameter.findUniqueOrThrow({ where: { key } })).value;
    const restore = await setParameter(prisma, key, typeof value === 'function' ? value(current) : value);
    try {
      return await work();
    } finally {
      await restore();
    }
  });
}
