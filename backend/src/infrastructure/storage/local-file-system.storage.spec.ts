import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import type { AppConfigService } from '@/config/app-config.service';

import { FileTooLargeError, InvalidStorageKeyError, StoredFileNotFoundError } from './file-storage.port';
import { LocalFileSystemStorage } from './local-file-system.storage';

/**
 * Pruebas contra un directorio temporal real: la seguridad del adaptador
 * (ruta dentro de la base, enlaces, temporales) solo se verifica con el
 * sistema de archivos de verdad.
 */

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lfs-storage-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function storageAt(path: string): LocalFileSystemStorage {
  return new LocalFileSystemStorage({ attachmentsStoragePath: path } as AppConfigService);
}

async function ready(path = join(root, 'base')): Promise<LocalFileSystemStorage> {
  const storage = storageAt(path);
  await storage.initialize();
  return storage;
}

function key(): string {
  return `2026/10/${randomUUID()}`;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe('LocalFileSystemStorage', () => {
  it('crea la ruta base al arrancar si no existe', async () => {
    const base = join(root, 'no', 'existe');
    await ready(base);
    await expect(readdir(base)).resolves.toEqual(['.tmp']);
  });

  it('no arranca si la ruta base es un archivo', async () => {
    const file = join(root, 'archivo');
    await writeFile(file, 'x');
    await expect(storageAt(file).initialize()).rejects.toThrow('ATTACHMENTS_STORAGE_PATH');
  });

  it('guarda, calcula tamaño y SHA-256, y devuelve el mismo contenido', async () => {
    const storage = await ready();
    const content = Buffer.from('%PDF-1.7 contenido de prueba');
    const storageKey = key();

    const result = await storage.save(Readable.from([content.subarray(0, 5), content.subarray(5)]), {
      storageKey,
      maxBytes: 1024,
    });

    expect(result).toEqual({ sizeBytes: content.length, checksum: createHash('sha256').update(content).digest('hex') });
    await expect(readAll(await storage.openRead(storageKey))).resolves.toEqual(content);
    await expect(readFile(join(root, 'base', ...storageKey.split('/')))).resolves.toEqual(content);
    // El temporal se publicó con rename: no queda nada en .tmp.
    await expect(readdir(join(root, 'base', '.tmp'))).resolves.toEqual([]);
  });

  it('corta en streaming al superar el máximo y no deja ni el archivo ni el temporal', async () => {
    const storage = await ready();
    const storageKey = key();
    let produced = 0;
    // Flujo "infinito": si el corte no fuera en streaming, la prueba no terminaría.
    const endless = new Readable({
      read(): void {
        produced += 64;
        this.push(Buffer.alloc(64, 1));
      },
    });

    await expect(storage.save(endless, { storageKey, maxBytes: 1000 })).rejects.toBeInstanceOf(FileTooLargeError);

    // Solo lo que cabe en los búferes internos del flujo (decenas de KiB), nunca "todo".
    expect(produced).toBeLessThan(200_000);
    await expect(storage.openRead(storageKey)).rejects.toBeInstanceOf(StoredFileNotFoundError);
    await expect(readdir(join(root, 'base', '.tmp'))).resolves.toEqual([]);
  });

  it('admite exactamente el máximo', async () => {
    const storage = await ready();
    await expect(storage.save(Readable.from([Buffer.alloc(10)]), { storageKey: key(), maxBytes: 10 })).resolves.toMatchObject({
      sizeBytes: 10,
    });
  });

  it.each([
    '../fuera',
    '2026/10/../../../fuera',
    '/etc/passwd',
    'C:/Windows/win.ini',
    '2026/13/7f8c2b4e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
    '2026/10/7f8c2b4e-1d2a-4c3b-9e8f-0a1b2c3d4e5f.pdf',
    '2026\\10\\7f8c2b4e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
    '',
  ])('rechaza la clave %p (solo <año>/<mes>/<uuid>)', async (storageKey) => {
    const storage = await ready();
    await expect(storage.save(Readable.from([Buffer.from('x')]), { storageKey, maxBytes: 10 })).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    await expect(storage.openRead(storageKey)).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(storage.delete(storageKey)).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('no sigue enlaces simbólicos que saquen la clave de la base', async () => {
    const base = join(root, 'base');
    const outside = join(root, 'fuera');
    await mkdir(join(outside, '10'), { recursive: true });
    const storage = await ready(base);
    // `junction` permite crear el enlace de directorio en Windows sin privilegios; en POSIX se ignora.
    await symlink(outside, join(base, '2026'), 'junction');

    await expect(
      storage.save(Readable.from([Buffer.from('x')]), { storageKey: key(), maxBytes: 10 }),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(readdir(join(outside, '10'))).resolves.toEqual([]);
  });

  it('openRead de una clave sin binario es StoredFileNotFoundError', async () => {
    const storage = await ready();
    await expect(storage.openRead(key())).rejects.toBeInstanceOf(StoredFileNotFoundError);
  });

  it('delete borra el binario y es idempotente', async () => {
    const storage = await ready();
    const storageKey = key();
    await storage.save(Readable.from([Buffer.from('x')]), { storageKey, maxBytes: 10 });

    await storage.delete(storageKey);
    await storage.delete(storageKey);

    await expect(storage.openRead(storageKey)).rejects.toBeInstanceOf(StoredFileNotFoundError);
  });

  it('no sobrescribe una clave ya ocupada', async () => {
    const storage = await ready();
    const storageKey = key();
    await storage.save(Readable.from([Buffer.from('original')]), { storageKey, maxBytes: 100 });

    await expect(storage.save(Readable.from([Buffer.from('otro')]), { storageKey, maxBytes: 100 })).rejects.toThrow(
      'already in use',
    );
    await expect(readAll(await storage.openRead(storageKey))).resolves.toEqual(Buffer.from('original'));
  });

  it('exige inicializar antes de usar', async () => {
    await expect(storageAt(join(root, 'x')).openRead(key())).rejects.toThrow('not initialized');
  });
});
