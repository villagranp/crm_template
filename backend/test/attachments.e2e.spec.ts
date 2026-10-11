import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Post,
  Res,
  type StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';

import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { attachmentDownload } from '@/modules/attachments/attachment-download';
import {
  AttachmentUploadInterceptor,
  toAttachmentUpload,
  type UploadedAttachmentFile,
} from '@/modules/attachments/attachment-upload.interceptor';
import type { AttachmentOwner } from '@/modules/attachments/attachment-policy';
import { type AttachmentActor, AttachmentsService } from '@/modules/attachments/attachments.service';
import { DOCX_BYTES, HTML_BYTES, PDF_BYTES } from '@/modules/attachments/testing/attachment-fixtures';

import { closeTestContext, createTestContext, createTestUser, type TestContext, type TestUser } from './support/test-app';

/**
 * Adjuntos (ADR-021, 02 §K.3 paso 6) contra PostgreSQL real y un directorio
 * temporal (`ATTACHMENTS_STORAGE_PATH`, ver `setup-env.ts`):
 *
 * - `AttachmentsService`: fila + binario coordinados, tipo por firma, corte de
 *   tamaño, compensación si falla la base, acotado al dueño, borrado lógico.
 * - `AttachmentUploadInterceptor` y `attachmentDownload` con multer y Express
 *   reales, en un controlador de prueba (los controladores de verdad son de los
 *   módulos dueños).
 */

const STORAGE_PATH = process.env.ATTACHMENTS_STORAGE_PATH as string;

let context: TestContext;
let attachments: AttachmentsService;
let owner: TestUser;
let actor: AttachmentActor;
let customerA: AttachmentOwner;
let customerB: AttachmentOwner;

async function createCustomer(salesOwnerId: string): Promise<AttachmentOwner> {
  const country = await context.prisma.country.findUniqueOrThrow({ where: { isoCode: 'GT' } });
  const status = await context.prisma.catalogItem.findFirstOrThrow({
    where: { code: 'ACTIVO', catalog: { key: 'crm.estado_cliente' } },
  });
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const customer = await context.prisma.customer.create({
    data: {
      crmCode: `TEST-CLI-${suffix}`,
      legalName: `Cliente de prueba ${suffix}`,
      legalNameNormalized: `cliente de prueba ${suffix.toLowerCase()}`,
      countryId: country.id,
      statusId: status.id,
      salesOwnerId,
    },
  });
  return { type: 'customer', id: customer.id };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Todos los binarios publicados bajo la base (excluye `.tmp`). */
async function storedFiles(): Promise<string[]> {
  const entries = await readdir(STORAGE_PATH, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.parentPath.includes('.tmp'))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function temporaryFiles(): Promise<string[]> {
  return readdir(join(STORAGE_PATH, '.tmp'));
}

function upload(content: Buffer, fileName: string, description?: string) {
  return { content: Readable.from([content]), fileName, description };
}

beforeAll(async () => {
  context = await createTestContext();
  attachments = context.app.get(AttachmentsService);
  owner = await createTestUser(context.prisma, { roleCodes: ['asesor'] });
  actor = {
    userId: owner.id,
    audit: { correlationId: `it-${randomUUID()}`, actorId: owner.id, actorEmail: owner.email, ipAddress: null },
  };
  customerA = await createCustomer(owner.id);
  customerB = await createCustomer(owner.id);
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('AttachmentsService (PostgreSQL + sistema de archivos)', () => {
  it('crea stored_files + attachments con tipo detectado, SHA-256 y binario bajo la clave generada', async () => {
    const created = await attachments.add(customerA, upload(PDF_BYTES, 'Cotización.pdf', 'versión 1'), actor);

    const row = await context.prisma.attachment.findUniqueOrThrow({ where: { id: created.id }, include: { storedFile: true } });
    expect(row).toMatchObject({ customerId: customerA.id, projectId: null, description: 'versión 1', createdById: owner.id });
    expect(row.storedFile).toMatchObject({
      fileName: 'Cotización.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
      checksum: createHash('sha256').update(PDF_BYTES).digest('hex'),
      ownerType: null,
      ownerId: null,
    });
    expect(row.storedFile.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    await expect(readFile(join(STORAGE_PATH, ...row.storedFile.storageKey.split('/')))).resolves.toEqual(PDF_BYTES);
    expect(created).toMatchObject({ createdBy: { id: owner.id, displayName: 'Persona De prueba' } });

    const audit = await context.prisma.auditLog.findFirst({ where: { resourceId: created.id, event: 'crm.attachment.added' } });
    expect(audit).toMatchObject({ resourceType: 'crm.attachment', correlationId: actor.audit.correlationId });
  });

  it('lista y abre solo dentro del dueño: el adjunto de un cliente no existe bajo otro', async () => {
    const created = await attachments.add(customerA, upload(DOCX_BYTES, 'propuesta.docx'), actor);

    const page = await attachments.list(customerA, { page: 1, pageSize: 50 });
    expect(page.items.map((item) => item.id)).toContain(created.id);
    expect(page.items.find((item) => item.id === created.id)).toMatchObject({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(page.items[0]).not.toHaveProperty('storageKey');

    const content = await attachments.open(customerA, created.id);
    await expect(readAll(content.stream)).resolves.toEqual(DOCX_BYTES);

    const otherPage = await attachments.list(customerB, { page: 1, pageSize: 50 });
    expect(otherPage.items.map((item) => item.id)).not.toContain(created.id);
    await expect(attachments.open(customerB, created.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(attachments.remove(customerB, created.id, actor)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('eliminar es lógico en attachments y stored_files, conserva el binario y deja de listarse', async () => {
    const created = await attachments.add(customerA, upload(PDF_BYTES, 'borrar.pdf'), actor);

    await attachments.remove(customerA, created.id, actor);

    const row = await context.prisma.attachment.findUniqueOrThrow({ where: { id: created.id }, include: { storedFile: true } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).toBe(owner.id);
    expect(row.storedFile.deletedAt).not.toBeNull();
    await expect(readFile(join(STORAGE_PATH, ...row.storedFile.storageKey.split('/')))).resolves.toEqual(PDF_BYTES);

    const page = await attachments.list(customerA, { page: 1, pageSize: 50 });
    expect(page.items.map((item) => item.id)).not.toContain(created.id);
    await expect(attachments.open(customerA, created.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(attachments.remove(customerA, created.id, actor)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('422 si el contenido no coincide con la extensión: ni fila ni binario', async () => {
    const before = await storedFiles();
    const rowsBefore = await context.prisma.attachment.count({ where: { customerId: customerA.id } });

    await expect(attachments.add(customerA, upload(HTML_BYTES, 'factura.pdf'), actor)).rejects.toMatchObject({
      code: 'ATTACHMENT_TYPE_NOT_ALLOWED',
    });

    expect(await storedFiles()).toEqual(before);
    expect(await temporaryFiles()).toEqual([]);
    expect(await context.prisma.attachment.count({ where: { customerId: customerA.id } })).toBe(rowsBefore);
  });

  it('413 al superar crm.adjuntos.max_mb (10 MiB): corte en streaming sin dejar nada', async () => {
    const before = await storedFiles();
    const tooBig = Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024)]);

    await expect(attachments.add(customerA, upload(tooBig, 'grande.pdf'), actor)).rejects.toMatchObject({
      code: 'ATTACHMENT_TOO_LARGE',
    });

    expect(await storedFiles()).toEqual(before);
    expect(await temporaryFiles()).toEqual([]);
  });

  it('si falla la escritura en la base, el binario ya guardado se borra (compensación)', async () => {
    const before = await storedFiles();
    // Dueño con forma válida pero inexistente: la FK de attachments rechaza la fila.
    const ghost: AttachmentOwner = { type: 'customer', id: randomUUID() };

    await expect(attachments.add(ghost, upload(PDF_BYTES, 'huerfano.pdf'), actor)).rejects.toThrow();

    expect(await storedFiles()).toEqual(before);
    expect(await context.prisma.storedFile.count({ where: { fileName: 'huerfano.pdf' } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Interceptor de subida y descarga con multer y Express reales
// ---------------------------------------------------------------------------

@Controller('probe')
class AttachmentProbeController {
  @Post('upload')
  @UseInterceptors(AttachmentUploadInterceptor)
  upload(@UploadedFile() file: UploadedAttachmentFile | undefined, @Body() body: { description?: string }) {
    const received = toAttachmentUpload(file, body.description);
    return { fileName: received.fileName, size: file?.size, description: received.description };
  }

  @Get('download')
  download(@Res({ passthrough: true }) response: Response): StreamableFile {
    return attachmentDownload(response, {
      stream: Readable.from([PDF_BYTES]),
      fileName: 'Cotización "final".pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
    });
  }
}

describe('AttachmentUploadInterceptor y attachmentDownload (HTTP)', () => {
  let probe: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [AttachmentProbeController] }).compile();
    probe = moduleRef.createNestApplication();
    const logger = { error: jest.fn() } as unknown as AppLogger;
    probe.useGlobalFilters(new AllExceptionsFilter(logger));
    probe.use((req: { correlationId?: string }, _res: unknown, next: () => void) => {
      req.correlationId = 'probe';
      next();
    });
    await probe.init();
  });

  afterAll(async () => {
    await probe.close();
  });

  it('acepta un archivo en el campo file con su descripción', async () => {
    const response = await request(probe.getHttpServer())
      .post('/probe/upload')
      .field('description', 'plano')
      .attach('file', PDF_BYTES, 'plano.pdf')
      .expect(201);
    expect(response.body).toEqual({ fileName: 'plano.pdf', size: PDF_BYTES.length, description: 'plano' });
  });

  it('sin archivo: 400 VALIDATION_FAILED sobre file', async () => {
    const response = await request(probe.getHttpServer()).post('/probe/upload').field('description', 'x').expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field: 'file' }] });
  });

  it('dos archivos: 400 VALIDATION_FAILED', async () => {
    const response = await request(probe.getHttpServer())
      .post('/probe/upload')
      .attach('file', PDF_BYTES, 'a.pdf')
      .attach('file', PDF_BYTES, 'b.pdf')
      .expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field: 'file' }] });
  });

  it('un archivo en otro campo: 400 VALIDATION_FAILED', async () => {
    const response = await request(probe.getHttpServer()).post('/probe/upload').attach('otro', PDF_BYTES, 'a.pdf').expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('por encima del techo de 10 MiB: 413 ATTACHMENT_TOO_LARGE con cuerpo JSON', async () => {
    const response = await request(probe.getHttpServer())
      .post('/probe/upload')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'enorme.pdf')
      .expect(413);
    expect(response.body).toMatchObject({ statusCode: 413, code: 'ATTACHMENT_TOO_LARGE', correlationId: 'probe' });
  });

  it('la descarga lleva Content-Disposition attachment RFC 5987, nosniff, no-store y el tipo guardado', async () => {
    const response = await request(probe.getHttpServer())
      .get('/probe/download')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-length']).toBe(String(PDF_BYTES.length));
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Cotizaci_n _final_.pdf"; filename*=UTF-8''Cotizaci%C3%B3n%20%22final%22.pdf`,
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(response.body as Buffer)).toEqual(PDF_BYTES);
  });
});
