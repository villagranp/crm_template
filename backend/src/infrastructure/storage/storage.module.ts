import { Module } from '@nestjs/common';

import { FILE_STORAGE } from './file-storage.port';
import { LocalFileSystemStorage } from './local-file-system.storage';

/**
 * Proveedor de `FILE_STORAGE` (ADR-021). Hoy, `LocalFileSystemStorage` sobre
 * `ATTACHMENTS_STORAGE_PATH`; otro almacenamiento sería otro adaptador (con ADR)
 * enlazado aquí, sin tocar los casos de uso. Lo importa `AttachmentsModule`.
 */
@Module({
  providers: [{ provide: FILE_STORAGE, useClass: LocalFileSystemStorage }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
