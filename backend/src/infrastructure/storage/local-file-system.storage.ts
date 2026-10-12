import { createHash, randomUUID } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { access, lstat, mkdir, open, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { type Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Injectable, type OnModuleInit } from '@nestjs/common';

import { AppConfigService } from '@/config/app-config.service';

import {
  type FileSaveOptions,
  type FileSaveResult,
  type FileStorage,
  FileTooLargeError,
  InvalidStorageKeyError,
  StorageKeyTakenError,
  StoredFileNotFoundError,
} from './file-storage.port';

/** Única forma de clave admitida: `<año>/<mes>/<uuid>` (ADR-021). */
const STORAGE_KEY_PATTERN =
  /^\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Temporales de escritura, dentro de la base (mismo sistema de archivos que el destino: `rename` atómico). */
const TEMP_DIRECTORY = '.tmp';
const DIRECTORY_MODE = 0o750;
const FILE_MODE = 0o640;
/** `O_NOFOLLOW` no existe en Windows; allí la defensa es la comprobación con `lstat`/`realpath`. */
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

/**
 * Adaptador `FileStorage` sobre un sistema de archivos montado (ADR-021).
 *
 * - Ruta base `ATTACHMENTS_STORAGE_PATH`: se crea al arrancar si falta; si no se
 *   puede crear o no es escribible, la aplicación no arranca (`onModuleInit`).
 * - Clave validada contra `<año>/<mes>/<uuid>` y ruta resuelta **dentro** de la
 *   base (defensa ante *path traversal* aunque la clave la genere el servidor).
 * - No sigue enlaces simbólicos: cada directorio de la clave debe resolverse
 *   (`realpath`) exactamente a su ruta esperada bajo la base, y el archivo no
 *   puede ser un enlace (`lstat` + `O_NOFOLLOW` donde exista).
 * - Escritura a `.tmp/<uuid>.part` y `rename` al final; corte en streaming al
 *   superar `maxBytes`; SHA-256 calculado al vuelo. Un fallo borra el temporal.
 *
 * Nunca registra nombres de archivo ni rutas completas en logs (datos personales).
 */
@Injectable()
export class LocalFileSystemStorage implements FileStorage, OnModuleInit {
  private readonly configuredPath: string;
  private basePath: string | null = null;

  constructor(config: AppConfigService) {
    this.configuredPath = config.attachmentsStoragePath;
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  /** Crea y verifica la ruta base. Idempotente. */
  async initialize(): Promise<void> {
    try {
      await mkdir(this.configuredPath, { recursive: true, mode: DIRECTORY_MODE });
      const base = await realpath(this.configuredPath);
      if (!(await stat(base)).isDirectory()) {
        throw new Error('not a directory');
      }
      await access(base, constants.R_OK | constants.W_OK);
      const temp = join(base, TEMP_DIRECTORY);
      await mkdir(temp, { recursive: true, mode: DIRECTORY_MODE });
      if ((await lstat(temp)).isSymbolicLink()) {
        throw new Error('temporary directory is a symbolic link');
      }
      this.basePath = base;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`ATTACHMENTS_STORAGE_PATH is not a usable writable directory: ${reason}`);
    }
  }

  async save(content: Readable, options: FileSaveOptions): Promise<FileSaveResult> {
    const base = this.requireBase();
    const target = this.resolveKey(base, options.storageKey);
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
      throw new Error('maxBytes must be a positive integer');
    }

    const tempPath = join(base, TEMP_DIRECTORY, `${randomUUID()}.part`);
    const hash = createHash('sha256');
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
        sizeBytes += chunk.length;
        if (sizeBytes > options.maxBytes) {
          callback(new FileTooLargeError(options.maxBytes));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(content, meter, createWriteStream(tempPath, { flags: 'wx', mode: FILE_MODE }));
      await this.ensureKeyDirectory(base, target);
      if (await exists(target)) {
        throw new StorageKeyTakenError();
      }
      await rename(tempPath, target);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }

    return { sizeBytes, checksum: hash.digest('hex') };
  }

  async openRead(storageKey: string): Promise<Readable> {
    const base = this.requireBase();
    const target = this.resolveKey(base, storageKey);
    try {
      await this.assertKeyDirectory(base, target);
      if ((await lstat(target)).isSymbolicLink()) {
        throw new InvalidStorageKeyError();
      }
      const handle = await open(target, constants.O_RDONLY | NO_FOLLOW);
      return handle.createReadStream();
    } catch (error) {
      if (isNotFound(error)) {
        throw new StoredFileNotFoundError();
      }
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const base = this.requireBase();
    const target = this.resolveKey(base, storageKey);
    try {
      await this.assertKeyDirectory(base, target);
      // `unlink` sobre un enlace borra el enlace, nunca su destino.
      await unlink(target);
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw error;
    }
  }

  private requireBase(): string {
    if (!this.basePath) {
      throw new Error('LocalFileSystemStorage is not initialized');
    }
    return this.basePath;
  }

  /** Ruta absoluta de la clave, garantizada dentro de la base. */
  private resolveKey(base: string, storageKey: string): string {
    if (typeof storageKey !== 'string' || !STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new InvalidStorageKeyError();
    }
    const target = resolve(base, ...storageKey.split('/'));
    if (!target.startsWith(base + sep)) {
      throw new InvalidStorageKeyError();
    }
    return target;
  }

  /** Crea los directorios `<año>/<mes>` y comprueba que no hay enlaces en el camino. */
  private async ensureKeyDirectory(base: string, target: string): Promise<void> {
    await mkdir(dirname(target), { recursive: true, mode: DIRECTORY_MODE });
    await this.assertKeyDirectory(base, target);
  }

  /** El directorio real de la clave debe ser exactamente el esperado bajo la base (sin enlaces simbólicos). */
  private async assertKeyDirectory(base: string, target: string): Promise<void> {
    const expected = dirname(target);
    const actual = await realpath(expected);
    if (actual !== expected || !actual.startsWith(base + sep)) {
      throw new InvalidStorageKeyError();
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}
