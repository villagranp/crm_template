/**
 * Adjuntos de la semilla de demostración (00 §8.3, ADR-021).
 *
 * - Los archivos se GENERAN aquí (un PDF de una página y un PNG pequeño, con su
 *   firma real): ningún binario versionado ni datos de terceros. Cada uno pesa
 *   menos de `DEMO_ATTACHMENT_MAX_BYTES` y pasa la detección por firma de la
 *   descarga (`attachment-content-type.ts`); se comprueba antes de escribirlo.
 * - Los binarios se escriben con el adaptador REAL `LocalFileSystemStorage` sobre
 *   `ATTACHMENTS_STORAGE_PATH` (misma validación, valor por defecto y resolución
 *   que la aplicación), así que aplican las reglas de ADR-021: clave
 *   `<año>/<mes>/<uuid>` generada por el servidor, escritura a temporal + `rename`,
 *   sin seguir enlaces simbólicos.
 * - Orden (ver `prisma/seed-demo.ts`): binarios primero, filas después en la
 *   transacción de la semilla; si la transacción falla se borran los binarios
 *   escritos (compensación). Los binarios de las filas demo purgadas se borran
 *   solo DESPUÉS del commit (`deleteStoredBinaries`), tolerando los que falten.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { deflateSync } from 'node:zlib';

import type { AppConfigService } from '../../../src/config/app-config.service';
import { envSchema } from '../../../src/config/env.schema';
import type { FileStorage } from '../../../src/infrastructure/storage/file-storage.port';
import { LocalFileSystemStorage } from '../../../src/infrastructure/storage/local-file-system.storage';
import {
  PDF_MIME_TYPE,
  PNG_MIME_TYPE,
  detectAttachmentMimeType,
  mimeTypeForFileName,
} from '../../../src/modules/attachments/attachment-content-type';
import { newStorageKey, sanitizeAttachmentFileName } from '../../../src/modules/attachments/attachment-policy';

import { DEMO_TAG } from './demo-data';

/** Tope de cada archivo demo (10 KiB): también es el `maxBytes` con el que se guarda. */
export const DEMO_ATTACHMENT_MAX_BYTES = 10 * 1024;

export interface DemoAttachmentSpec {
  /** Clave del cliente demo en `demo-seeder.ts#CUSTOMERS` (C1…C8). */
  readonly customer: string;
  readonly fileName: string;
  readonly mimeType: typeof PDF_MIME_TYPE | typeof PNG_MIME_TYPE;
  readonly description: string;
  readonly content: Buffer;
}

/** Binario ya guardado: lo que necesitan las filas `stored_files` y `attachments`. */
export interface PreparedDemoAttachment {
  readonly customer: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly description: string;
}

// -----------------------------------------------------------------------------
// Generación de archivos
// -----------------------------------------------------------------------------

/** PDF 1.4 válido de una página con texto Helvetica (solo ASCII), con su tabla `xref`. */
export function buildDemoPdf(lines: readonly string[]): Buffer {
  const escapeText = (text: string): string => text.replace(/[\\()]/g, (match) => `\\${match}`);
  const text = lines.map((line, index) => `${index === 0 ? '' : '0 -20 Td '}(${escapeText(line)}) Tj`).join('\n');
  const stream = `BT\n/F1 14 Tf\n72 720 Td\n${text}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/**
 * PNG válido (RGB de 8 bits, CRC correctos) con un "croquis" sencillo: fondo
 * claro, una cuadrícula y un bloque central. Sin dependencias: `zlib` de Node.
 */
export function buildDemoPng(width: number, height: number): Buffer {
  const background = [0xf2, 0xf4, 0xf7];
  const grid = [0xc8, 0xcf, 0xd8];
  const block = [0x2f, 0x5d, 0x8a];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const inBlock = x >= width / 3 && x < (2 * width) / 3 && y >= height / 3 && y < (2 * height) / 3;
      const color = inBlock ? block : x % 8 === 0 || y % 8 === 0 ? grid : background;
      row.set(color, 1 + x * 3);
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // profundidad
  header.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Adjuntos demo: solo en clientes demo vigentes (no en el eliminado). Contenido ficticio. */
export const DEMO_ATTACHMENTS: readonly DemoAttachmentSpec[] = [
  {
    customer: 'C1',
    fileName: 'Ficha técnica demo.pdf',
    mimeType: PDF_MIME_TYPE,
    description: `${DEMO_TAG} Ficha técnica de ejemplo (archivo ficticio)`,
    content: buildDemoPdf(['Documento de demostracion', 'Ficha tecnica ficticia', 'Sin valor comercial']),
  },
  {
    customer: 'C3',
    fileName: 'Croquis de ubicación demo.png',
    mimeType: PNG_MIME_TYPE,
    description: `${DEMO_TAG} Croquis de ubicación de ejemplo (imagen ficticia)`,
    content: buildDemoPng(48, 32),
  },
  {
    customer: 'C6',
    fileName: 'Cotización de ejemplo demo.pdf',
    mimeType: PDF_MIME_TYPE,
    description: `${DEMO_TAG} Cotización de ejemplo (archivo ficticio)`,
    content: buildDemoPdf(['Documento de demostracion', 'Cotizacion ficticia', 'Montos ilustrativos, no oficiales']),
  },
];

// -----------------------------------------------------------------------------
// Almacenamiento
// -----------------------------------------------------------------------------

/**
 * Ruta base absoluta, con la MISMA regla que la aplicación: el esquema de
 * `env.schema.ts` (vacío → `./storage/attachments`, recorte, sin NUL, ≤ 1024) y
 * `resolve()` contra el directorio de trabajo, como `AppConfigService`.
 */
export function resolveAttachmentsStoragePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(envSchema.innerType().shape.ATTACHMENTS_STORAGE_PATH.parse(env.ATTACHMENTS_STORAGE_PATH));
}

/**
 * Adaptador real fuera de Nest: solo necesita `attachmentsStoragePath` de la
 * configuración. `initialize()` crea y verifica la base (falla si no es usable).
 */
export async function openDemoStorage(env: NodeJS.ProcessEnv = process.env): Promise<FileStorage> {
  const config = { attachmentsStoragePath: resolveAttachmentsStoragePath(env) } as AppConfigService;
  const storage = new LocalFileSystemStorage(config);
  await storage.initialize();
  return storage;
}

/**
 * Comprueba y escribe los binarios demo. Si uno falla, borra los ya escritos y
 * relanza: nunca quedan binarios sin fila por esta causa.
 */
export async function writeDemoAttachmentFiles(
  storage: FileStorage,
  specs: readonly DemoAttachmentSpec[] = DEMO_ATTACHMENTS,
  now: Date = new Date(),
): Promise<PreparedDemoAttachment[]> {
  const prepared: PreparedDemoAttachment[] = [];
  try {
    for (const spec of specs) {
      const fileName = sanitizeAttachmentFileName(spec.fileName);
      assertDemoContent(spec, fileName);
      const storageKey = newStorageKey(now);
      const saved = await storage.save(Readable.from([spec.content]), { storageKey, maxBytes: DEMO_ATTACHMENT_MAX_BYTES });
      prepared.push({
        customer: spec.customer,
        storageKey,
        fileName,
        mimeType: spec.mimeType,
        sizeBytes: saved.sizeBytes,
        checksum: saved.checksum,
        description: spec.description,
      });
    }
  } catch (error) {
    await deleteStoredBinaries(storage, prepared.map((entry) => entry.storageKey));
    throw error;
  }
  return prepared;
}

/** El tipo por extensión, el declarado y el detectado por firma deben coincidir (la descarga lo exige). */
function assertDemoContent(spec: DemoAttachmentSpec, fileName: string): void {
  const detected = detectAttachmentMimeType(spec.content.subarray(0, 16), spec.content);
  if (mimeTypeForFileName(fileName) !== spec.mimeType || detected !== spec.mimeType) {
    throw new Error(`Semilla demo: el adjunto de ${spec.customer} no tiene el tipo declarado (${spec.mimeType}).`);
  }
  if (spec.content.length > DEMO_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Semilla demo: el adjunto de ${spec.customer} supera ${DEMO_ATTACHMENT_MAX_BYTES} bytes.`);
  }
}

/**
 * Borra binarios por clave. Una clave sin binario no es error (el adaptador es
 * idempotente). Cualquier otro fallo no interrumpe el resto: se devuelve cuántos
 * no se pudieron borrar para avisar (las filas ya no existen; queda un huérfano).
 */
export async function deleteStoredBinaries(storage: FileStorage, storageKeys: readonly string[]): Promise<number> {
  let failed = 0;
  for (const storageKey of storageKeys) {
    try {
      await storage.delete(storageKey);
    } catch {
      failed += 1;
    }
  }
  return failed;
}

/** SHA-256 hexadecimal (mismo cálculo que el adaptador para `stored_files.checksum`). */
export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
