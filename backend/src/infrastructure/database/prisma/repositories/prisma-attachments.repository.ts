import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { AttachmentOwner, AttachmentOwnerType } from '@/modules/attachments/attachment-policy';
import type {
  AttachmentContentRef,
  AttachmentRecord,
  AttachmentsRepository,
  CreateAttachmentInput,
  ListAttachmentsRequest,
} from '@/modules/attachments/ports/attachments.repository.port';

import { PrismaService } from '../prisma.service';

/** Columna FK de cada tipo de dueño (00 §2.11; `ck_attachments_single_owner` exige exactamente una). */
const OWNER_COLUMN: Readonly<Record<AttachmentOwnerType, 'customerId' | 'projectId' | 'visitId' | 'visitEventId' | 'activityId'>> = {
  customer: 'customerId',
  project: 'projectId',
  visit: 'visitId',
  visitEvent: 'visitEventId',
  activity: 'activityId',
};

const ATTACHMENT_SELECT = {
  id: true,
  storedFileId: true,
  description: true,
  createdAt: true,
  createdById: true,
  storedFile: { select: { fileName: true, mimeType: true, sizeBytes: true, storageKey: true } },
} satisfies Prisma.AttachmentSelect;

type AttachmentRow = Prisma.AttachmentGetPayload<{ select: typeof ATTACHMENT_SELECT }>;
type UserNames = ReadonlyMap<string, string>;

/** Filtro "este adjunto, de este dueño, no eliminado". */
function ownedBy(owner: AttachmentOwner): Prisma.AttachmentWhereInput {
  return { [OWNER_COLUMN[owner.type]]: owner.id, deletedAt: null };
}

function toRecord(row: AttachmentRow, names: UserNames): AttachmentRecord & { storedFileId: string } {
  const creatorName = row.createdById ? names.get(row.createdById) : undefined;
  return {
    id: row.id,
    storedFileId: row.storedFileId,
    fileName: row.storedFile.fileName,
    contentType: row.storedFile.mimeType,
    sizeBytes: row.storedFile.sizeBytes,
    description: row.description,
    createdAt: row.createdAt,
    createdBy: row.createdById && creatorName !== undefined ? { id: row.createdById, displayName: creatorName } : null,
  };
}

function toPublicRecord(record: AttachmentRecord & { storedFileId: string }): AttachmentRecord {
  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    description: record.description,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  };
}

function orderByFor(request: ListAttachmentsRequest): Prisma.AttachmentOrderByWithRelationInput[] {
  const direction = request.sortOrder ?? 'desc';
  const primary: Prisma.AttachmentOrderByWithRelationInput =
    request.sortBy === 'fileName'
      ? { storedFile: { fileName: direction } }
      : request.sortBy === 'sizeBytes'
        ? { storedFile: { sizeBytes: direction } }
        : { createdAt: direction };
  // Desempate estable para la paginación.
  return [primary, { id: 'asc' }];
}

/**
 * Adaptador de `AttachmentsRepository` (00 §2.11). `created_by_id` no es FK
 * (el registro sobrevive al usuario): el nombre del autor se resuelve aparte,
 * en una sola consulta por página.
 */
@Injectable()
export class PrismaAttachmentsRepository implements AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(owner: AttachmentOwner, request: ListAttachmentsRequest): Promise<Page<AttachmentRecord>> {
    const where = ownedBy(owner);
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.attachment.findMany({
        where,
        select: ATTACHMENT_SELECT,
        orderBy: orderByFor(request),
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      this.prisma.attachment.count({ where }),
    ]);
    const names = await this.userNames(this.prisma, rows);
    return createPage(
      rows.map((row) => toPublicRecord(toRecord(row, names))),
      totalItems,
      request,
    );
  }

  async findContent(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentContentRef | null> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, ...ownedBy(owner), storedFile: { deletedAt: null } },
      select: ATTACHMENT_SELECT,
    });
    return row
      ? {
          attachmentId: row.id,
          storedFileId: row.storedFileId,
          storageKey: row.storedFile.storageKey,
          fileName: row.storedFile.fileName,
          contentType: row.storedFile.mimeType,
          sizeBytes: row.storedFile.sizeBytes,
        }
      : null;
  }

  async create(input: CreateAttachmentInput): Promise<AttachmentRecord & { storedFileId: string }> {
    // Escritura anidada: Prisma inserta `stored_files` y `attachments` en una sola transacción.
    // La relación del dueño se llama igual que su tipo (`customer`, `visitEvent`…).
    const owner = { [input.owner.type]: { connect: { id: input.owner.id } } } as Pick<
      Prisma.AttachmentCreateInput,
      AttachmentOwnerType
    >;
    const row = await this.prisma.attachment.create({
      data: {
        ...owner,
        description: input.description,
        createdById: input.createdById,
        storedFile: {
          create: {
            storageKey: input.storedFile.storageKey,
            fileName: input.storedFile.fileName,
            mimeType: input.storedFile.mimeType,
            sizeBytes: input.storedFile.sizeBytes,
            checksum: input.storedFile.checksum,
            uploadedById: input.createdById,
          },
        },
      },
      select: ATTACHMENT_SELECT,
    });
    return toRecord(row, await this.userNames(this.prisma, [row]));
  }

  async softDelete(
    owner: AttachmentOwner,
    attachmentId: string,
    deletedById: string | null,
  ): Promise<(AttachmentRecord & { storedFileId: string }) | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.attachment.findFirst({ where: { id: attachmentId, ...ownedBy(owner) }, select: ATTACHMENT_SELECT });
      if (!row) {
        return null;
      }
      const deletedAt = new Date();
      // Condición repetida en el UPDATE: dos borrados concurrentes no auditan dos veces.
      const { count } = await tx.attachment.updateMany({
        where: { id: attachmentId, deletedAt: null },
        data: { deletedAt, deletedById },
      });
      if (count === 0) {
        return null;
      }
      await tx.storedFile.update({ where: { id: row.storedFileId }, data: { deletedAt } });
      return toRecord(row, await this.userNames(tx, [row]));
    });
  }

  private async userNames(db: Prisma.TransactionClient, rows: readonly AttachmentRow[]): Promise<UserNames> {
    const ids = [...new Set(rows.map((row) => row.createdById).filter((id): id is string => id !== null))];
    if (ids.length === 0) {
      return new Map();
    }
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}
