import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type request from 'supertest';

import { DOCX_BYTES, HTML_BYTES, JPEG_BYTES, PDF_BYTES, PNG_BYTES, XLSX_BYTES } from '@/modules/attachments/testing/attachment-fixtures';

import { api, type CrmUser, crmUser, insertCustomer, insertProject, testCountry, uniqueSuffix, withParameter } from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Adjuntos del cliente (02 F17–F20, ADR-021; PF-02.24, 34 y 60) con el
 * almacenamiento en el directorio temporal de `ATTACHMENTS_STORAGE_PATH`
 * (`setup-env.ts`). País propio `Q9`.
 */

const STORAGE_PATH = process.env.ATTACHMENTS_STORAGE_PATH as string;
const MAX_MB = 'crm.adjuntos.max_mb';

let context: TestContext;
let q9: string;

beforeAll(async () => {
  context = await createTestContext();
  q9 = await testCountry(context.prisma, 'Q9', { name: 'Prueba Nueve' });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function ownerWithCustomer(): Promise<{ owner: CrmUser; customerId: string }> {
  const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: q9 });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q9 });
  return { owner, customerId: customer.id };
}

function upload(user: CrmUser, customerId: string, content: Buffer, fileName: string, description?: string): request.Test {
  const test = api(context, user.token).post(`/customers/${customerId}/attachments`).attach('file', content, fileName);
  return description === undefined ? test : test.field('description', description);
}

function download(user: CrmUser, path: string): request.Test {
  return api(context, user.token)
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

async function storedFiles(): Promise<string[]> {
  try {
    const entries = await readdir(STORAGE_PATH, { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && !entry.parentPath.includes('.tmp')).map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return [];
  }
}

describe('Autenticación y permisos (PF-02.60)', () => {
  it('401 sin token y 403 sin el permiso en F17–F20', async () => {
    const customerId = randomUUID();
    const attachmentId = randomUUID();
    const calls = (client: ReturnType<typeof api>) => [
      () => client.get(`/customers/${customerId}/attachments`),
      () => client.post(`/customers/${customerId}/attachments`).attach('file', PDF_BYTES, 'a.pdf'),
      () => client.get(`/customers/${customerId}/attachments/${attachmentId}/content`),
      () => client.delete(`/customers/${customerId}/attachments/${attachmentId}`),
    ];
    for (const call of calls(api(context))) await call().expect(401);
    const plain = await crmUser(context, { roleCodes: ['usuario'] });
    for (const call of calls(api(context, plain.token))) await call().expect(403);
  });
});

describe('F17–F20 (PF-02.34, PF-02.60)', () => {
  it('sube cada tipo permitido, lo lista y lo descarga quien ve el cliente, con las cabeceras de seguridad', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const inheritor = await crmUser(context, { roleCodes: ['asesor'], countryId: q9 });
    await insertProject(context.prisma, { customerId, ownerId: inheritor.id, countryId: q9 });
    const files: [Buffer, string, string][] = [
      [PDF_BYTES, 'Cotización.pdf', 'application/pdf'],
      [JPEG_BYTES, 'foto.jpg', 'image/jpeg'],
      [PNG_BYTES, 'plano.png', 'image/png'],
      [DOCX_BYTES, 'propuesta.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      [XLSX_BYTES, 'precios.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ];

    const ids: string[] = [];
    for (const [content, fileName, contentType] of files) {
      const response = await upload(owner, customerId, content, fileName, 'documento de prueba').expect(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        fileName,
        contentType,
        sizeBytes: content.length,
        description: 'documento de prueba',
        createdAt: expect.any(String),
        createdBy: { id: owner.id, displayName: 'Persona De prueba' },
      });
      expect(response.headers['location']).toBe(`/api/v1/customers/${customerId}/attachments/${response.body.id}/content`);
      expect(JSON.stringify(response.body)).not.toMatch(/storageKey|storage_key|\d{4}\/\d{2}\//);
      ids.push(response.body.id);
    }

    const listed = await api(context, inheritor.token).get(`/customers/${customerId}/attachments`).expect(200);
    expect(listed.body.data.map((item: { id: string }) => item.id).sort()).toEqual([...ids].sort());
    expect(JSON.stringify(listed.body)).not.toContain('storageKey');

    const content = await download(inheritor, `/customers/${customerId}/attachments/${ids[0]}/content`).expect(200);
    expect(content.headers['content-type']).toBe('application/pdf');
    expect(content.headers['content-disposition']).toBe(`attachment; filename="Cotizaci_n.pdf"; filename*=UTF-8''Cotizaci%C3%B3n.pdf`);
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(content.body as Buffer)).toEqual(PDF_BYTES);

    const [event] = await context.prisma.auditLog.findMany({ where: { event: 'crm.attachment.added', resourceId: ids[0] } });
    expect(event).toMatchObject({ resourceType: 'crm.attachment', metadata: expect.objectContaining({ ownerType: 'customer', ownerId: customerId }) });

    // Quien solo lo ve por herencia no sube ni elimina.
    await upload(inheritor, customerId, PDF_BYTES, 'x.pdf').expect(403);
    await api(context, inheritor.token).delete(`/customers/${customerId}/attachments/${ids[0]}`).expect(403);
  });

  it('firma falsa → 422; exceso de tamaño → 413 sin binario ni fila; validaciones del multipart → 400', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const executable = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(64)]);

    for (const [content, fileName] of [
      [executable, 'factura.pdf'],
      [HTML_BYTES, 'pagina.pdf'],
      [PDF_BYTES, 'script.exe'],
    ] as [Buffer, string][]) {
      const response = await upload(owner, customerId, content, fileName).expect(422);
      expect(response.body.code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');
    }

    const filesBefore = await storedFiles();
    await withParameter(context.prisma, MAX_MB, '1', async () => {
      const tooBig = Buffer.concat([PDF_BYTES, Buffer.alloc(1024 * 1024 + 10)]);
      const response = await upload(owner, customerId, tooBig, 'grande.pdf').expect(413);
      expect(response.body).toMatchObject({ code: 'ATTACHMENT_TOO_LARGE', details: [expect.objectContaining({ field: 'file' })] });
    });
    expect(await storedFiles()).toEqual(filesBefore);
    expect(await context.prisma.attachment.count({ where: { customerId } })).toBe(0);

    const noFile = await api(context, owner.token).post(`/customers/${customerId}/attachments`).field('description', 'x').expect(400);
    expect(noFile.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field: 'file' }] });
    await upload(owner, customerId, PDF_BYTES, 'a.pdf').field('extra', 'x').expect(400);
    await upload(owner, customerId, PDF_BYTES, 'a.pdf', 'x'.repeat(301)).expect(400);
  });

  it('el corte de tamaño es el crm.adjuntos.max_mb vigente y la autorización va antes de leer el archivo', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const other = await ownerWithCustomer();
    const inheritor = await crmUser(context, { roleCodes: ['asesor'], countryId: q9 });
    await insertProject(context.prisma, { customerId, ownerId: inheritor.id, countryId: q9 });
    // Entre el máximo vigente (1 MiB) y el techo absoluto (10 MiB).
    const twoMegabytes = Buffer.concat([PDF_BYTES, Buffer.alloc(2 * 1024 * 1024)]);

    await withParameter(context.prisma, MAX_MB, '1', async () => {
      // Quien puede editar: el interceptor corta en el máximo vigente → 413 con ese máximo.
      const tooBig = await upload(owner, customerId, twoMegabytes, 'grande.pdf').expect(413);
      expect(tooBig.body).toMatchObject({ code: 'ATTACHMENT_TOO_LARGE', details: [{ field: 'file', maxBytes: 1024 * 1024 }] });
      // Sin acceso, la respuesta es 404/403 y no 413: se decide antes de leer el multipart.
      await upload(owner, other.customerId, twoMegabytes, 'ajeno.pdf').expect(404);
      await upload(inheritor, customerId, twoMegabytes, 'heredado.pdf').expect(403);
    });
    expect(await context.prisma.attachment.count({ where: { customerId: { in: [customerId, other.customerId] } } })).toBe(0);
  });

  it('alta del cliente y subida posterior con fallo parcial: el cliente se conserva (PF-02.24)', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: q9 });
    const created = await api(context, owner.token)
      .post('/customers')
      .send({ legalName: `Con adjuntos ${uniqueSuffix()}`, countryId: q9, taxId: String(Date.now()).slice(-9), email: `a-${uniqueSuffix().toLowerCase()}@example.com` })
      .expect(201);
    const customerId = created.body.id as string;

    await upload(owner, customerId, PDF_BYTES, 'contrato.pdf').expect(201);
    await upload(owner, customerId, Buffer.alloc(10 * 1024 * 1024 + 1), 'enorme.pdf').expect(413);

    await api(context, owner.token).get(`/customers/${customerId}`).expect(200);
    const listed = await api(context, owner.token).get(`/customers/${customerId}/attachments`).expect(200);
    expect(listed.body.data.map((item: { fileName: string }) => item.fileName)).toEqual(['contrato.pdf']);
  });

  it('descarga y borrado solo dentro del cliente; borrado lógico en ambas tablas; sin visibilidad → 404', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const other = await ownerWithCustomer();
    const mine = await upload(owner, customerId, PNG_BYTES, 'mio.png').expect(201);
    const theirs = await upload(other.owner, other.customerId, PDF_BYTES, 'suyo.pdf').expect(201);

    // Adjunto de otro cliente bajo la ruta de este → 404; cliente que no ve → 404.
    await api(context, owner.token).get(`/customers/${customerId}/attachments/${theirs.body.id}/content`).expect(404);
    await api(context, owner.token).delete(`/customers/${customerId}/attachments/${theirs.body.id}`).expect(404);
    await api(context, owner.token).get(`/customers/${other.customerId}/attachments/${theirs.body.id}/content`).expect(404);
    await api(context, owner.token).get(`/customers/${other.customerId}/attachments`).expect(404);

    // Ninguna ruta estática sirve los binarios.
    const row = await context.prisma.attachment.findUniqueOrThrow({ where: { id: mine.body.id }, include: { storedFile: true } });
    await api(context).get(`/${row.storedFile.storageKey}`).expect(404);
    await api(context, owner.token).get(`/storage/attachments/${row.storedFile.storageKey}`).expect(404);

    await api(context, owner.token).delete(`/customers/${customerId}/attachments/${mine.body.id}`).expect(204);
    const deleted = await context.prisma.attachment.findUniqueOrThrow({ where: { id: mine.body.id }, include: { storedFile: true } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.storedFile.deletedAt).not.toBeNull();
    expect((await api(context, owner.token).get(`/customers/${customerId}/attachments`).expect(200)).body.data).toEqual([]);
    await api(context, owner.token).get(`/customers/${customerId}/attachments/${mine.body.id}/content`).expect(404);
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.attachment.removed', resourceId: mine.body.id } })).toBe(1);
  });
});
