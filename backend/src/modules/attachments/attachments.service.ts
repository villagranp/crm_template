import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import {
  FILE_STORAGE,
  type FileStorage,
  FileTooLargeError,
  StoredFileNotFoundError,
} from '@/infrastructure/storage/file-storage.port';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { ContentSniffer, expectedTypeForFileName, verifyAttachmentContent } from './attachment-content-type';
import {
  AttachmentContentMissingError,
  attachmentTooLargeError,
  attachmentTypeNotAllowedError,
} from './attachment-errors';
import {
  ATTACHMENT_DESCRIPTION_MAX_LENGTH,
  type AttachmentOwner,
  isAttachmentOwnerType,
  isUuid,
  maxBytesFromMegabytes,
  newStorageKey,
  normalizeAttachmentDescription,
  sanitizeAttachmentFileName,
} from './attachment-policy';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentRecord,
  type AttachmentsRepository,
  type ListAttachmentsRequest,
} from './ports/attachments.repository.port';

/** Parámetros del CRM que gobiernan los adjuntos (00 §8.2). */
export const ATTACHMENT_MAX_MB_PARAMETER = 'crm.adjuntos.max_mb';
export const ATTACHMENT_ALLOWED_TYPES_PARAMETER = 'crm.adjuntos.tipos_permitidos';

/** `resourceType` de la auditoría (02 RN-02.31). */
export const ATTACHMENT_AUDIT_RESOURCE = 'crm.attachment';
export const ATTACHMENT_ADDED_EVENT = 'crm.attachment.added';
export const ATTACHMENT_REMOVED_EVENT = 'crm.attachment.removed';

/** Quién opera: usuario local (para `created_by_id`/`deleted_by_id`) y contexto de auditoría. */
export interface AttachmentActor {
  readonly userId: string | null;
  readonly audit: AuditContext;
}

export interface AttachmentUpload {
  /** Contenido; se consume una sola vez. */
  readonly content: Readable;
  /** Nombre original tal como llega (se sanea aquí). */
  readonly fileName: string;
  readonly description?: string | null;
}

/** Binario listo para transmitir (ver `attachment-download.ts`). */
export interface AttachmentContent {
  readonly stream: Readable;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface AttachmentLimits {
  readonly maxBytes: number;
  readonly allowedTypes: readonly string[];
}

/**
 * Servicio transversal de adjuntos (02 F.6.5, 00 §11, ADR-021).
 *
 * Opera siempre dentro de un dueño (`owner = { type, id }`, DC-2). **No autoriza**:
 * el módulo dueño comprueba antes permiso, visibilidad (fuera del alcance → 404)
 * y política de edición, y solo entonces llama aquí.
 *
 * - `add`: tipo esperado por extensión + lista blanca → guarda en streaming con
 *   corte de tamaño y SHA-256 → confirma el tipo por la firma → inserta
 *   `stored_files` + `attachments`. Si algo falla después de guardar, borra el
 *   binario (compensación). Audita `crm.attachment.added`.
 * - `remove`: borrado lógico de fila y archivo; el binario se purga después
 *   según la retención (ADR-021). Audita `crm.attachment.removed`.
 * - `open`: flujo del binario; fila sin binario → error registrado (500).
 *
 * Los límites se leen en cada operación (`ParameterReader`, sin caché): un
 * cambio de `crm.adjuntos.*` rige en la siguiente subida.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(ATTACHMENTS_REPOSITORY) private readonly repository: AttachmentsRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async limits(): Promise<AttachmentLimits> {
    const [maxMb, allowedTypes] = await Promise.all([
      this.parameters.get<number>(ATTACHMENT_MAX_MB_PARAMETER),
      this.parameters.get<string[]>(ATTACHMENT_ALLOWED_TYPES_PARAMETER),
    ]);
    return { maxBytes: maxBytesFromMegabytes(maxMb), allowedTypes };
  }

  list(owner: AttachmentOwner, request: ListAttachmentsRequest): Promise<Page<AttachmentRecord>> {
    assertOwner(owner);
    return this.repository.list(owner, request);
  }

  async add(owner: AttachmentOwner, upload: AttachmentUpload, actor: AttachmentActor): Promise<AttachmentRecord> {
    assertOwner(owner);
    const description = normalizeAttachmentDescription(upload.description);
    if (description !== null && [...description].length > ATTACHMENT_DESCRIPTION_MAX_LENGTH) {
      // El DTO del dueño ya lo valida con 400; llegar aquí es un error de programación.
      throw new Error(`Attachment description exceeds ${ATTACHMENT_DESCRIPTION_MAX_LENGTH} characters`);
    }

    const { maxBytes, allowedTypes } = await this.limits();
    const fileName = sanitizeAttachmentFileName(upload.fileName);
    const expected = expectedTypeForFileName(fileName, allowedTypes);
    if (!expected.ok) {
      upload.content.destroy();
      throw attachmentTypeNotAllowedError(allowedTypes);
    }

    const storageKey = newStorageKey();
    const sniffer = new ContentSniffer();
    upload.content.once('error', (error) => sniffer.destroy(error));
    let saved: { sizeBytes: number; checksum: string };
    try {
      saved = await this.storage.save(upload.content.pipe(sniffer), { storageKey, maxBytes });
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        throw attachmentTooLargeError(maxBytes);
      }
      throw error;
    }

    const verdict = verifyAttachmentContent(expected.mimeType, sniffer.head, sniffer.tail);
    if (!verdict.ok) {
      await this.compensate(storageKey, 'type_not_allowed');
      throw attachmentTypeNotAllowedError(allowedTypes);
    }

    let created: AttachmentRecord & { storedFileId: string };
    try {
      created = await this.repository.create({
        owner,
        description,
        createdById: actor.userId,
        storedFile: {
          storageKey,
          fileName,
          mimeType: verdict.mimeType,
          sizeBytes: saved.sizeBytes,
          checksum: saved.checksum,
        },
      });
    } catch (error) {
      await this.compensate(storageKey, 'database_write_failed');
      throw error;
    }

    this.logger.info('attachment_added', {
      correlationId: actor.audit.correlationId,
      attachmentId: created.id,
      storedFileId: created.storedFileId,
      ownerType: owner.type,
      ownerId: owner.id,
      sizeBytes: created.sizeBytes,
    });
    await this.audit.record(ATTACHMENT_ADDED_EVENT, actor.audit, {
      resourceType: ATTACHMENT_AUDIT_RESOURCE,
      resourceId: created.id,
      before: null,
      after: auditState(created),
      metadata: { ownerType: owner.type, ownerId: owner.id, storedFileId: created.storedFileId },
    });

    return withoutStoredFileId(created);
  }

  async open(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentContent> {
    assertOwner(owner);
    const ref = isUuid(attachmentId) ? await this.repository.findContent(owner, attachmentId) : null;
    if (!ref) {
      throw new ResourceNotFoundError('Attachment', attachmentId);
    }

    try {
      const stream = await this.storage.openRead(ref.storageKey);
      return { stream, fileName: ref.fileName, contentType: ref.contentType, sizeBytes: ref.sizeBytes };
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) {
        this.logger.error('attachment_binary_missing', {
          attachmentId: ref.attachmentId,
          storedFileId: ref.storedFileId,
        });
        throw new AttachmentContentMissingError(ref.attachmentId);
      }
      throw error;
    }
  }

  async remove(owner: AttachmentOwner, attachmentId: string, actor: AttachmentActor): Promise<void> {
    assertOwner(owner);
    const removed = isUuid(attachmentId) ? await this.repository.softDelete(owner, attachmentId, actor.userId) : null;
    if (!removed) {
      throw new ResourceNotFoundError('Attachment', attachmentId);
    }

    this.logger.info('attachment_removed', {
      correlationId: actor.audit.correlationId,
      attachmentId: removed.id,
      storedFileId: removed.storedFileId,
      ownerType: owner.type,
      ownerId: owner.id,
    });
    await this.audit.record(ATTACHMENT_REMOVED_EVENT, actor.audit, {
      resourceType: ATTACHMENT_AUDIT_RESOURCE,
      resourceId: removed.id,
      metadata: { ownerType: owner.type, ownerId: owner.id, storedFileId: removed.storedFileId },
    });
  }

  /** Deshace un binario ya guardado. Si tampoco se puede borrar, queda huérfano y se registra para su limpieza. */
  private async compensate(storageKey: string, reason: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.error('attachment_orphan_binary', {
        storageKey,
        reason,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}

function assertOwner(owner: AttachmentOwner): void {
  if (!isAttachmentOwnerType(owner.type) || !isUuid(owner.id)) {
    // El dueño lo construye el módulo que llama a partir de un id ya validado.
    throw new Error('Invalid attachment owner');
  }
}

/**
 * Lo que se audita del adjunto. El nombre es el mismo que ve quien puede ver el
 * dueño; no se audita la clave de almacenamiento.
 */
function auditState(record: AttachmentRecord): Record<string, unknown> {
  return {
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    description: record.description,
  };
}

function withoutStoredFileId(record: AttachmentRecord & { storedFileId: string }): AttachmentRecord {
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
