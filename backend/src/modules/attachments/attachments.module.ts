import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaAttachmentsRepository } from '@/infrastructure/database/prisma/repositories/prisma-attachments.repository';
import { StorageModule } from '@/infrastructure/storage/storage.module';

import { AttachmentUploadInterceptor } from './attachment-upload.interceptor';
import { AttachmentsService } from './attachments.service';
import { ATTACHMENTS_REPOSITORY } from './ports/attachments.repository.port';

/**
 * Adjuntos transversales (02 F.6.5, 00 §11, ADR-021). Sin controladores: cada
 * módulo dueño (Clientes, Proyectos, Actividad) expone sus rutas
 * (`/{dueño}/{id}/attachments…`, DC-2), autoriza sobre el dueño y delega aquí.
 *
 * Exporta `AttachmentsService` y `AttachmentUploadInterceptor`. `ParameterReader`
 * y `AuditService` llegan de módulos globales.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  providers: [
    AttachmentsService,
    AttachmentUploadInterceptor,
    { provide: ATTACHMENTS_REPOSITORY, useClass: PrismaAttachmentsRepository },
  ],
  exports: [AttachmentsService, AttachmentUploadInterceptor],
})
export class AttachmentsModule {}
