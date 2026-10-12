import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import {
  ContactEmailConflictError,
  type ContactDuplicateProbe,
  type ContactDuplicateRow,
  type ContactEmailHolder,
  type ContactRecord,
  type ContactsRepository,
  type ContactSortField,
  type CreateContactInput,
  type ListContactsCriteria,
  type UpdateContactInput,
} from '@/modules/customers/ports/contacts.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { normalizedTextSql, orSql } from '../sql-text';

const UNIQUE_VIOLATION = 'P2002';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DUPLICATE_CANDIDATES = 50;

const CONTACT_SELECT = {
  id: true,
  customerId: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  phone: true,
  email: true,
  emailNormalized: true,
  isActive: true,
  comments: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { primaryContactId: true } },
  _count: { select: { participations: true } },
} satisfies Prisma.ContactSelect;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof CONTACT_SELECT }>;

function toContactRecord(row: ContactRow): ContactRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    firstName: row.firstName,
    lastName: row.lastName,
    jobTitle: row.jobTitle,
    phone: row.phone,
    email: row.email,
    emailNormalized: row.emailNormalized,
    isActive: row.isActive,
    isPrimary: row.customer.primaryContactId === row.id,
    comments: row.comments,
    hasHistory: row._count.participations > 0,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function orderByFor(sortBy: ContactSortField, direction: 'asc' | 'desc'): Prisma.ContactOrderByWithRelationInput[] {
  const tieBreaker: Prisma.ContactOrderByWithRelationInput[] = [{ id: 'asc' }];
  switch (sortBy) {
    case 'firstName':
      return [{ firstName: direction }, { lastName: direction }, ...tieBreaker];
    case 'jobTitle':
      return [{ jobTitle: { sort: direction, nulls: 'last' } }, { lastName: 'asc' }, ...tieBreaker];
    case 'createdAt':
      return [{ createdAt: direction }, ...tieBreaker];
    case 'lastName':
      return [{ lastName: direction }, { firstName: direction }, ...tieBreaker];
  }
}

function isEmailViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== UNIQUE_VIOLATION) return false;
  const target = error.meta?.['target'];
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('email');
}

/**
 * Adaptador Prisma de contactos (02 L.1). El contacto principal es
 * `customers.primary_contact_id`; su FK compuesta impide apuntar a un contacto
 * de otro cliente, y quien desactiva o elimina el principal lo limpia en la misma
 * transacción (el servicio pasa el `tx`).
 */
@Injectable()
export class PrismaContactsRepository implements ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string, criteria: ListContactsCriteria): Promise<Page<ContactRecord>> {
    const term = criteria.search?.trim();
    const where: Prisma.ContactWhereInput = {
      customerId,
      deletedAt: criteria.deleted ? { not: null } : null,
      ...(criteria.status === 'ACTIVE' ? { isActive: true } : criteria.status === 'INACTIVE' ? { isActive: false } : {}),
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { jobTitle: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        select: CONTACT_SELECT,
        orderBy: orderByFor(criteria.sortBy, criteria.sortOrder),
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return createPage(rows.map(toContactRecord), totalItems, criteria);
  }

  async findById(
    customerId: string,
    contactId: string,
    options: { readonly includeDeleted: boolean },
    tx?: TransactionContext,
  ): Promise<ContactRecord | null> {
    if (!UUID_PATTERN.test(contactId)) return null;
    const row = await prismaClientFor(this.prisma, tx).contact.findFirst({
      where: { id: contactId, customerId, ...(options.includeDeleted ? {} : { deletedAt: null }) },
      select: CONTACT_SELECT,
    });
    return row ? toContactRecord(row) : null;
  }

  async findEmailHolder(
    customerId: string,
    emailNormalized: string,
    excludeContactId: string | null,
    tx?: TransactionContext,
  ): Promise<ContactEmailHolder | null> {
    const row = await prismaClientFor(this.prisma, tx).contact.findFirst({
      where: { customerId, emailNormalized, ...(excludeContactId ? { id: { not: excludeContactId } } : {}) },
      select: { id: true, deletedAt: true },
    });
    return row ? { id: row.id, isDeleted: row.deletedAt !== null } : null;
  }

  async findDuplicateCandidates(probe: ContactDuplicateProbe, tx?: TransactionContext): Promise<ContactDuplicateRow[]> {
    const fullName = probe.nombreCompleto
      ? Prisma.sql`${normalizedTextSql(Prisma.sql`(c.first_name || ' ' || c.last_name)`)} = ${probe.nombreCompleto}`
      : null;
    const phone = probe.telefono
      ? Prisma.sql`regexp_replace(COALESCE(c.phone, ''), ${'\\D'}, '', 'g') = ${probe.telefono}`
      : null;
    const active = [fullName, phone].filter((condition): condition is Prisma.Sql => condition !== null);
    if (active.length === 0) return [];

    const exclude = probe.excludeContactId ? Prisma.sql`AND c.id <> ${probe.excludeContactId}::uuid` : Prisma.empty;
    const rows = await prismaClientFor(this.prisma, tx).$queryRaw<
      {
        id: string;
        first_name: string;
        last_name: string;
        job_title: string | null;
        deleted_at: Date | null;
        m_nombre: boolean;
        m_telefono: boolean;
      }[]
    >`
      SELECT c.id, c.first_name, c.last_name, c.job_title, c.deleted_at,
             COALESCE(${fullName ?? Prisma.sql`FALSE`}, FALSE) AS m_nombre,
             COALESCE(${phone ?? Prisma.sql`FALSE`}, FALSE) AS m_telefono
      FROM contacts c
      WHERE c.customer_id = ${probe.customerId}::uuid ${exclude}
        AND ${orSql(active)}
      ORDER BY c.last_name ASC, c.first_name ASC
      LIMIT ${MAX_DUPLICATE_CANDIDATES}`;

    return rows.map((row) => {
      const rules: ('nombreCompleto' | 'telefono')[] = [];
      if (row.m_nombre) rules.push('nombreCompleto');
      if (row.m_telefono) rules.push('telefono');
      return {
        rules,
        candidate: {
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          jobTitle: row.job_title,
          isDeleted: row.deleted_at !== null,
        },
      };
    });
  }

  async create(input: CreateContactInput, tx: TransactionContext): Promise<string> {
    try {
      const created = await prismaClientFor(this.prisma, tx).contact.create({
        data: { ...input, updatedById: input.createdById },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      if (isEmailViolation(error)) throw new ContactEmailConflictError();
      throw error;
    }
  }

  async update(customerId: string, contactId: string, input: UpdateContactInput, tx: TransactionContext): Promise<void> {
    try {
      await prismaClientFor(this.prisma, tx).contact.update({ where: { id: contactId, customerId }, data: input });
    } catch (error) {
      if (isEmailViolation(error)) throw new ContactEmailConflictError();
      throw error;
    }
  }

  async lockCustomerPrimary(customerId: string, tx: TransactionContext): Promise<{ primaryContactId: string | null } | null> {
    if (!UUID_PATTERN.test(customerId)) return null;
    const rows = await prismaClientFor(this.prisma, tx).$queryRaw<{ primary_contact_id: string | null }[]>`
      SELECT primary_contact_id FROM customers
      WHERE id = ${customerId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    const row = rows[0];
    return row ? { primaryContactId: row.primary_contact_id } : null;
  }

  async lockContactRow(customerId: string, contactId: string, mode: 'UPDATE' | 'SHARE', tx: TransactionContext): Promise<boolean> {
    if (!UUID_PATTERN.test(customerId) || !UUID_PATTERN.test(contactId)) return false;
    const db = prismaClientFor(this.prisma, tx);
    const rows =
      mode === 'UPDATE'
        ? await db.$queryRaw<{ id: string }[]>`
            SELECT id FROM contacts WHERE id = ${contactId}::uuid AND customer_id = ${customerId}::uuid FOR UPDATE`
        : await db.$queryRaw<{ id: string }[]>`
            SELECT id FROM contacts WHERE id = ${contactId}::uuid AND customer_id = ${customerId}::uuid FOR SHARE`;
    return rows.length > 0;
  }

  async setPrimary(customerId: string, contactId: string, actorId: string | null, tx: TransactionContext): Promise<boolean> {
    // Condicional (RN-02.26): nunca apunta a un contacto inactivo o eliminado, aunque el llamador lo leyera antes.
    const result = await prismaClientFor(this.prisma, tx).customer.updateMany({
      where: { id: customerId, contacts: { some: { id: contactId, isActive: true, deletedAt: null } } },
      data: { primaryContactId: contactId, updatedById: actorId },
    });
    return result.count > 0;
  }

  async clearPrimary(customerId: string, contactId: string | null, actorId: string | null, tx: TransactionContext): Promise<boolean> {
    // Condicional: solo limpia si el principal sigue siendo ese contacto (no borra uno elegido en paralelo).
    const result = await prismaClientFor(this.prisma, tx).customer.updateMany({
      where: { id: customerId, ...(contactId ? { primaryContactId: contactId } : { primaryContactId: { not: null } }) },
      data: { primaryContactId: null, updatedById: actorId },
    });
    return result.count > 0;
  }

  async softDelete(customerId: string, contactId: string, actorId: string | null, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).contact.update({
      where: { id: contactId, customerId },
      data: { deletedAt: new Date(), updatedById: actorId },
    });
  }

  async restore(customerId: string, contactId: string, actorId: string | null): Promise<void> {
    await this.prisma.contact.update({ where: { id: contactId, customerId }, data: { deletedAt: null, updatedById: actorId } });
  }

  async hasHistory(contactId: string, tx?: TransactionContext): Promise<boolean> {
    const count = await prismaClientFor(this.prisma, tx).interactionParticipant.count({ where: { contactId } });
    return count > 0;
  }
}
