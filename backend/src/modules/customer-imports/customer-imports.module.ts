import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCustomerImportsRepository } from '@/infrastructure/database/prisma/repositories/prisma-customer-imports.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CustomersModule } from '@/modules/customers/customers.module';

import { CustomerImportProcessor } from './customer-import-processor';
import { CustomerImportUploadInterceptor } from './customer-import-upload.interceptor';
import { CustomerImportsController } from './customer-imports.controller';
import { CustomerImportsService } from './customer-imports.service';
import { ImportRowValidator } from './import-row-validator';
import { CUSTOMER_IMPORTS_REPOSITORY } from './ports/customer-imports.repository.port';

/**
 * Módulo 6 · Integraciones: carga masiva de clientes (06, F-42). Dueño de
 * `customer_imports` y `customer_import_rows`. Crea clientes **solo** con el caso
 * de uso de alta del Módulo 2 y valida con su servicio (`CustomersModule`).
 * `AuditModule`, `ParametersCoreModule` y `PrismaModule` (transacciones y
 * secuencias) son globales. Ningún servicio importa Prisma (ADR-004).
 */
@Module({
  imports: [PrismaModule, AccessModule, CustomersModule],
  controllers: [CustomerImportsController],
  providers: [
    CustomerImportsService,
    CustomerImportProcessor,
    ImportRowValidator,
    CustomerImportUploadInterceptor,
    { provide: CUSTOMER_IMPORTS_REPOSITORY, useClass: PrismaCustomerImportsRepository },
  ],
  exports: [CustomerImportsService],
})
export class CustomerImportsModule {}
