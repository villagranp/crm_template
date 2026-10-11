import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaContactsRepository } from '@/infrastructure/database/prisma/repositories/prisma-contacts.repository';
import { PrismaCustomersRepository } from '@/infrastructure/database/prisma/repositories/prisma-customers.repository';
import { AccessModule } from '@/modules/access/access.module';
import { AttachmentsModule } from '@/modules/attachments/attachments.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';

import { ContactsService } from './contacts.service';
import { CustomerActorResolver } from './customer-actor.resolver';
import { CustomerAttachmentsController } from './customer-attachments.controller';
import { CustomerContactsController } from './customer-contacts.controller';
import { CustomerCreationService } from './customer-creation.service';
import { CustomerReferenceGuard } from './customer-reference.guard';
import { CustomerValidationService } from './customer-validation.service';
import { CustomerVisibilityService } from './customer-visibility.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CONTACTS_REPOSITORY } from './ports/contacts.repository.port';
import { CUSTOMERS_REPOSITORY } from './ports/customers.repository.port';

/**
 * Módulo 2 · Clientes / Cuentas (02). Dueño de `customers`, `contacts` y de los
 * adjuntos con `customer_id`.
 *
 * Los puertos se enlazan aquí a sus adaptadores Prisma; ningún servicio de este
 * módulo importa Prisma (ADR-004). `AuditModule`, `ParametersCoreModule` y
 * `PrismaModule` (transacciones y secuencias) son globales.
 *
 * Exporta lo que reutilizan otros módulos (02 F.6): `CustomerValidationService` y
 * `CustomerCreationService` (Módulo 6), `CustomerReferenceGuard` (Módulos 3 y 4)
 * y `CustomerActorResolver` para construir el actor que reciben.
 */
@Module({
  imports: [PrismaModule, AccessModule, CatalogsModule, AttachmentsModule],
  controllers: [CustomersController, CustomerContactsController, CustomerAttachmentsController],
  providers: [
    CustomersService,
    ContactsService,
    CustomerActorResolver,
    CustomerVisibilityService,
    CustomerValidationService,
    CustomerCreationService,
    CustomerReferenceGuard,
    { provide: CUSTOMERS_REPOSITORY, useClass: PrismaCustomersRepository },
    { provide: CONTACTS_REPOSITORY, useClass: PrismaContactsRepository },
  ],
  exports: [CustomerValidationService, CustomerCreationService, CustomerReferenceGuard, CustomerActorResolver],
})
export class CustomersModule {}
