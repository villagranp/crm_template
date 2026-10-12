import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

import type { AttachmentOwner } from '../attachment-policy';

export const ATTACHMENTS_REPOSITORY = Symbol('ATTACHMENTS_REPOSITORY');

/** Campos de orden admitidos en la lista (lista blanca, API-STANDARDS). */
export const ATTACHMENT_SORT_FIELDS = ['createdAt', 'fileName', 'sizeBytes'] as const;
export type AttachmentSortField = (typeof ATTACHMENT_SORT_FIELDS)[number];

/** Adjunto tal como lo ve el dueño (02 F.5 `AttachmentResponseDto`). Nunca expone la clave de almacenamiento. */
export interface AttachmentRecord {
  readonly id: string;
  readonly fileName: string;
  /** Tipo detectado por firma al guardar (`stored_files.mime_type`). */
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly createdBy: { readonly id: string; readonly displayName: string } | null;
}

/** Lo necesario para transmitir el binario. Solo lo usa `AttachmentsService.open`. */
export interface AttachmentContentRef {
  readonly attachmentId: string;
  readonly storedFileId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface CreateAttachmentInput {
  readonly owner: AttachmentOwner;
  readonly description: string | null;
  readonly createdById: string | null;
  readonly storedFile: {
    readonly storageKey: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly checksum: string;
  };
}

export interface ListAttachmentsRequest extends PageRequest {
  readonly sortBy?: AttachmentSortField;
}

/**
 * Persistencia de `attachments` + `stored_files` (00 §2.11). Todas las lecturas y
 * escrituras se acotan al dueño: un adjunto de otro dueño, o eliminado, no existe.
 */
export interface AttachmentsRepository {
  list(owner: AttachmentOwner, request: ListAttachmentsRequest): Promise<Page<AttachmentRecord>>;
  findContent(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentContentRef | null>;
  /** Inserta `stored_files` y `attachments` en una sola transacción. */
  create(input: CreateAttachmentInput): Promise<AttachmentRecord & { readonly storedFileId: string }>;
  /**
   * Borrado lógico (`deleted_at`) del adjunto y de su `stored_files`, en una
   * transacción. `null` si no existe, es de otro dueño o ya estaba eliminado.
   */
  softDelete(
    owner: AttachmentOwner,
    attachmentId: string,
    deletedById: string | null,
  ): Promise<(AttachmentRecord & { readonly storedFileId: string }) | null>;
}
