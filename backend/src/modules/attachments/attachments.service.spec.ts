import { Readable } from 'node:stream';

import { BusinessRuleViolationError, PayloadTooLargeError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import {
  type FileSaveOptions,
  type FileStorage,
  FileTooLargeError,
  StoredFileNotFoundError,
} from '@/infrastructure/storage/file-storage.port';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';
import { ATTACHMENT_MIME_TYPES } from '@/modules/parameters/parameter-rules.registry';

import { ATTACHMENT_TOO_LARGE, ATTACHMENT_TYPE_NOT_ALLOWED, AttachmentContentMissingError } from './attachment-errors';
import type { AttachmentOwner } from './attachment-policy';
import { type AttachmentActor, AttachmentsService } from './attachments.service';
import type { AttachmentRecord, AttachmentsRepository, CreateAttachmentInput } from './ports/attachments.repository.port';
import { DOCX_BYTES, HTML_BYTES, PDF_BYTES } from './testing/attachment-fixtures';

const OWNER: AttachmentOwner = { type: 'customer', id: '0b8c4c1e-6d55-4a8e-9a41-3c9d2f1e7a10' };
const ATTACHMENT_ID = '5d1f7e2a-3b4c-4d5e-8f60-718293a4b5c6';
const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'user-1', actorEmail: null, ipAddress: null };
const ACTOR: AttachmentActor = { userId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', audit: AUDIT };

/** Almacenamiento en memoria que consume el flujo como el real (con corte por tamaño). */
class MemoryStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  failDelete = false;

  async save(content: Readable, options: FileSaveOptions): Promise<{ sizeBytes: number; checksum: string }> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of content) {
      size += (chunk as Buffer).length;
      if (size > options.maxBytes) {
        content.destroy();
        throw new FileTooLargeError(options.maxBytes);
      }
      chunks.push(chunk as Buffer);
    }
    this.files.set(options.storageKey, Buffer.concat(chunks));
    return { sizeBytes: size, checksum: 'sha256-de-prueba' };
  }

  async openRead(storageKey: string): Promise<Readable> {
    const file = this.files.get(storageKey);
    if (!file) throw new StoredFileNotFoundError();
    return Readable.from([file]);
  }

  async delete(storageKey: string): Promise<void> {
    if (this.failDelete) throw new Error('disco no disponible');
    this.deleted.push(storageKey);
    this.files.delete(storageKey);
  }
}

function record(input: CreateAttachmentInput): AttachmentRecord & { storedFileId: string } {
  return {
    id: ATTACHMENT_ID,
    storedFileId: 'stored-1',
    fileName: input.storedFile.fileName,
    contentType: input.storedFile.mimeType,
    sizeBytes: input.storedFile.sizeBytes,
    description: input.description,
    createdAt: new Date('2026-10-11T10:00:00.000Z'),
    createdBy: { id: ACTOR.userId as string, displayName: 'Persona' },
  };
}

function setup(options: { maxMb?: number; allowed?: string[] } = {}) {
  const storage = new MemoryStorage();
  const repository = {
    list: jest.fn(),
    findContent: jest.fn(),
    create: jest.fn(async (input: CreateAttachmentInput) => record(input)),
    softDelete: jest.fn(),
  };
  const parameters = {
    get: jest.fn(async (key: string) =>
      key === 'crm.adjuntos.max_mb' ? (options.maxMb ?? 10) : (options.allowed ?? [...ATTACHMENT_MIME_TYPES]),
    ),
  } as unknown as ParameterReader;
  const audit = { record: jest.fn(async () => undefined) };
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as AppLogger;
  const service = new AttachmentsService(
    repository as unknown as AttachmentsRepository,
    storage,
    parameters,
    audit as unknown as AuditService,
    logger,
  );
  return { service, storage, repository, audit, logger };
}

function upload(content: Buffer, fileName: string, description?: string) {
  return { content: Readable.from([content]), fileName, description };
}

describe('AttachmentsService', () => {
  describe('add', () => {
    it('guarda el binario, registra fila con el tipo detectado y el nombre saneado, y audita', async () => {
      const { service, storage, repository, audit } = setup();

      const result = await service.add(OWNER, upload(PDF_BYTES, '../Cotización.pdf', '  versión final '), ACTOR);

      const input = repository.create.mock.calls[0]?.[0] as CreateAttachmentInput;
      expect(input).toMatchObject({
        owner: OWNER,
        description: 'versión final',
        createdById: ACTOR.userId,
        storedFile: { fileName: 'Cotización.pdf', mimeType: 'application/pdf', sizeBytes: PDF_BYTES.length },
      });
      expect(input.storedFile.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
      expect(storage.files.get(input.storedFile.storageKey)).toEqual(PDF_BYTES);
      expect(result).not.toHaveProperty('storedFileId');
      expect(result).toMatchObject({ id: ATTACHMENT_ID, contentType: 'application/pdf' });
      expect(audit.record).toHaveBeenCalledWith(
        'crm.attachment.added',
        AUDIT,
        expect.objectContaining({
          resourceType: 'crm.attachment',
          resourceId: ATTACHMENT_ID,
          metadata: { ownerType: 'customer', ownerId: OWNER.id, storedFileId: 'stored-1' },
        }),
      );
    });

    it('detecta un DOCX por su contenido, no por lo que diga el navegador', async () => {
      const { service, repository } = setup();
      await service.add(OWNER, upload(DOCX_BYTES, 'propuesta.docx'), ACTOR);
      expect(repository.create.mock.calls[0]?.[0].storedFile.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('rechaza con 422 una extensión no admitida sin escribir nada', async () => {
      const { service, storage, repository } = setup();

      const error = await service.add(OWNER, upload(HTML_BYTES, 'pagina.html'), ACTOR).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect(error).toMatchObject({ code: ATTACHMENT_TYPE_NOT_ALLOWED });
      expect(storage.files.size).toBe(0);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza con 422 un tipo fuera de la lista blanca vigente (crm.adjuntos.tipos_permitidos)', async () => {
      const { service } = setup({ allowed: ['image/png'] });
      await expect(service.add(OWNER, upload(PDF_BYTES, 'a.pdf'), ACTOR)).rejects.toMatchObject({
        code: ATTACHMENT_TYPE_NOT_ALLOWED,
        details: [{ field: 'file', allowedTypes: ['image/png'] }],
      });
    });

    it('rechaza con 422 un contenido que no coincide con la extensión y borra el binario guardado', async () => {
      const { service, storage, repository } = setup();

      await expect(service.add(OWNER, upload(HTML_BYTES, 'factura.pdf'), ACTOR)).rejects.toMatchObject({
        code: ATTACHMENT_TYPE_NOT_ALLOWED,
      });

      expect(storage.deleted).toHaveLength(1);
      expect(storage.files.size).toBe(0);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('responde 413 ATTACHMENT_TOO_LARGE al superar crm.adjuntos.max_mb', async () => {
      const { service, repository } = setup({ maxMb: 1 });
      const big = Buffer.concat([PDF_BYTES, Buffer.alloc(1024 * 1024)]);

      const error = await service.add(OWNER, upload(big, 'grande.pdf'), ACTOR).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PayloadTooLargeError);
      expect(error).toMatchObject({ code: ATTACHMENT_TOO_LARGE, details: [{ field: 'file', maxBytes: 1024 * 1024 }] });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('si falla la escritura en la base, borra el binario (compensación) y propaga el error', async () => {
      const { service, storage, repository, audit } = setup();
      repository.create.mockRejectedValueOnce(new Error('fallo de base'));

      await expect(service.add(OWNER, upload(PDF_BYTES, 'a.pdf'), ACTOR)).rejects.toThrow('fallo de base');

      expect(storage.deleted).toHaveLength(1);
      expect(storage.files.size).toBe(0);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('si tampoco puede borrar el binario, lo registra como huérfano sin ocultar el error original', async () => {
      const { service, storage, repository, logger } = setup();
      repository.create.mockRejectedValueOnce(new Error('fallo de base'));
      storage.failDelete = true;

      await expect(service.add(OWNER, upload(PDF_BYTES, 'a.pdf'), ACTOR)).rejects.toThrow('fallo de base');
      expect(logger.error).toHaveBeenCalledWith(
        'attachment_orphan_binary',
        expect.objectContaining({ reason: 'database_write_failed' }),
      );
    });

    it('rechaza un dueño inválido (error de programación del módulo que llama)', async () => {
      const { service } = setup();
      await expect(
        service.add({ type: 'customer', id: 'no-uuid' }, upload(PDF_BYTES, 'a.pdf'), ACTOR),
      ).rejects.toThrow('Invalid attachment owner');
    });
  });

  describe('open', () => {
    it('devuelve el flujo con el nombre y el tipo guardados', async () => {
      const { service, storage, repository } = setup();
      storage.files.set('2026/10/k', PDF_BYTES);
      repository.findContent.mockResolvedValueOnce({
        attachmentId: ATTACHMENT_ID,
        storedFileId: 'stored-1',
        storageKey: '2026/10/k',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: PDF_BYTES.length,
      });

      const content = await service.open(OWNER, ATTACHMENT_ID);

      expect(repository.findContent).toHaveBeenCalledWith(OWNER, ATTACHMENT_ID);
      expect(content).toMatchObject({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: PDF_BYTES.length });
    });

    it('404 si no existe en ese dueño, o si el id no es un UUID', async () => {
      const { service, repository } = setup();
      repository.findContent.mockResolvedValueOnce(null);

      await expect(service.open(OWNER, ATTACHMENT_ID)).rejects.toBeInstanceOf(ResourceNotFoundError);
      await expect(service.open(OWNER, 'x')).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(repository.findContent).toHaveBeenCalledTimes(1);
    });

    it('fila sin binario: error registrado (500), nunca otro archivo', async () => {
      const { service, repository, logger } = setup();
      repository.findContent.mockResolvedValueOnce({
        attachmentId: ATTACHMENT_ID,
        storedFileId: 'stored-1',
        storageKey: '2026/10/inexistente',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
      });

      await expect(service.open(OWNER, ATTACHMENT_ID)).rejects.toBeInstanceOf(AttachmentContentMissingError);
      expect(logger.error).toHaveBeenCalledWith(
        'attachment_binary_missing',
        expect.objectContaining({ attachmentId: ATTACHMENT_ID, storedFileId: 'stored-1' }),
      );
    });
  });

  describe('remove', () => {
    it('borra lógicamente dentro del dueño, conserva el binario y audita', async () => {
      const { service, storage, repository, audit } = setup();
      repository.softDelete.mockResolvedValueOnce({ id: ATTACHMENT_ID, storedFileId: 'stored-1' });

      await service.remove(OWNER, ATTACHMENT_ID, ACTOR);

      expect(repository.softDelete).toHaveBeenCalledWith(OWNER, ATTACHMENT_ID, ACTOR.userId);
      expect(storage.deleted).toEqual([]);
      expect(audit.record).toHaveBeenCalledWith(
        'crm.attachment.removed',
        AUDIT,
        expect.objectContaining({ resourceType: 'crm.attachment', resourceId: ATTACHMENT_ID }),
      );
    });

    it('404 si no existe, es de otro dueño o ya estaba eliminado', async () => {
      const { service, repository, audit } = setup();
      repository.softDelete.mockResolvedValueOnce(null);

      await expect(service.remove(OWNER, ATTACHMENT_ID, ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('limits lee los parámetros en cada llamada', async () => {
    const { service } = setup({ maxMb: 2, allowed: ['application/pdf'] });
    await expect(service.limits()).resolves.toEqual({ maxBytes: 2 * 1024 * 1024, allowedTypes: ['application/pdf'] });
  });
});
