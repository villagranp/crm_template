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
  options: { phonePattern?: string | null; taxIdPattern?: string | null; isActive?: boolean; name?: string } = {},
): Promise<string> {
  const data = {
    name: options.name ?? `País de prueba ${isoCode}`,
    currencyCode: 'USD',
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

/** Proyecto mínimo (herencia de visibilidad y dependencias, 02 RN-02.18, RN-02.22). */
export async function insertProject(
  prisma: PrismaClient,
  options: { customerId: string; ownerId: string; countryId: string; deletedAt?: Date | null },
): Promise<string> {
  const project = await prisma.project.create({
    data: {
      code: `TEST-PRY-${uniqueSuffix()}`,
      name: 'Proyecto de prueba',
      customerId: options.customerId,
      ownerId: options.ownerId,
      countryId: options.countryId,
      phaseId: await catalogItemId(prisma, 'crm.fase_cliente', 'DISENO'),
      deletedAt: options.deletedAt ?? null,
    },
  });
  return project.id;
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
      deletedAt: options.deletedAt ?? null,
    },
  });
  return activity.id;
}

/** Oportunidad mínima de un proyecto (vínculos de actividades, 04 RN-04.1). */
export async function insertOpportunity(
  prisma: PrismaClient,
  options: { projectId: string; ownerId: string; deletedAt?: Date | null },
): Promise<string> {
  const opportunity = await prisma.opportunity.create({
    data: {
      code: `TEST-OPO-${uniqueSuffix()}`,
      projectId: options.projectId,
      ownerId: options.ownerId,
      stageId: await catalogItemId(prisma, 'crm.etapa_oportunidad', 'CONTACTADO'),
      opportunityDate: new Date(),
      deletedAt: options.deletedAt ?? null,
    },
  });
  return opportunity.id;
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
    },
  });
  return visit.id;
}

export async function insertParticipant(prisma: PrismaClient, options: { activityId: string; customerId: string; contactId: string }): Promise<void> {
  await prisma.interactionParticipant.create({
    data: { activityId: options.activityId, customerId: options.customerId, contactId: options.contactId },
  });
}

/** Equipo con responsable, padre y miembros opcionales (alcance TEAM con subequipos, DM-12). */
export async function insertTeam(
  prisma: PrismaClient,
  options: { managerId?: string | null; parentId?: string | null; memberIds?: string[] } = {},
): Promise<string> {
  const team = await prisma.team.create({
    data: {
      code: `test-team-${uniqueSuffix().toLowerCase()}`,
      name: 'Equipo de prueba',
      managerId: options.managerId ?? null,
      parentId: options.parentId ?? null,
      members: { create: (options.memberIds ?? []).map((userId) => ({ userId })) },
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
