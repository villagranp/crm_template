import type { Readable } from 'node:stream';

/**
 * Almacenamiento de binarios (ADR-021, 00 §2.11). Los casos de uso dependen de
 * este puerto, nunca de `fs` ni de rutas: el dominio no sabe dónde vive un archivo.
 */
export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileSaveOptions {
  /**
   * Clave relativa **generada por el servidor** (`<año>/<mes>/<uuid>`, ver
   * `attachment-policy.ts#newStorageKey`). Nunca contiene datos del usuario.
   * El adaptador rechaza cualquier otra forma (`InvalidStorageKeyError`).
   */
  readonly storageKey: string;
  /** Tamaño máximo en bytes: al superarlo se corta la escritura (`FileTooLargeError`). */
  readonly maxBytes: number;
}

export interface FileSaveResult {
  readonly sizeBytes: number;
  /** SHA-256 en hexadecimal del contenido guardado (`stored_files.checksum`). */
  readonly checksum: string;
}

export interface FileStorage {
  /**
   * Consume `content` y lo guarda bajo `storageKey`. Escribe a un temporal y lo
   * publica al final: si falla o se corta, no queda nada bajo la clave ni el
   * temporal. Una clave ya ocupada no se sobrescribe (`StorageKeyTakenError`).
   */
  save(content: Readable, options: FileSaveOptions): Promise<FileSaveResult>;
  /** Flujo de lectura del binario; `StoredFileNotFoundError` si no existe. */
  openRead(storageKey: string): Promise<Readable>;
  /** Borra el binario. Idempotente: una clave inexistente no es error. */
  delete(storageKey: string): Promise<void>;
}

/** El contenido supera `maxBytes`. Nada queda guardado. */
export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The file exceeds ${maxBytes} bytes`);
    this.name = 'FileTooLargeError';
  }
}

/** No hay binario para la clave (fila sin archivo): se registra y responde 500, nunca otro archivo. */
export class StoredFileNotFoundError extends Error {
  constructor() {
    super('The stored file does not exist');
    this.name = 'StoredFileNotFoundError';
  }
}

/** La clave no tiene la forma generada por el servidor o se resuelve fuera de la base. */
export class InvalidStorageKeyError extends Error {
  constructor() {
    super('Invalid storage key');
    this.name = 'InvalidStorageKeyError';
  }
}

/** Ya existe un binario con esa clave (no debería ocurrir: la clave lleva un UUID). */
export class StorageKeyTakenError extends Error {
  constructor() {
    super('The storage key is already in use');
    this.name = 'StorageKeyTakenError';
  }
}
