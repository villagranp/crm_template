-- =============================================================================
-- CRM Fase 0 — paso 4 de 00-modelo-de-datos.md §9: clientes y contactos
--
-- SQL de Prisma generado con `prisma migrate diff` (schema anterior -> nuevo),
-- repartido por tabla entre los pasos de §9 y completado a mano con lo que
-- Prisma no expresa (CHECK y el orden de la FK circular). Prisma ignora los CHECK en la detección de
-- deriva, así que `migrate dev` no los borra.
-- Rollback: prisma/rollbacks/20261010100300_crm_customers_contacts.down.sql
-- =============================================================================
-- customers se crea sin la FK del contacto principal; contacts después; la FK
-- compuesta circular customers(primary_contact_id, id) -> contacts(id, customer_id)
-- se añade al final. La FK customers.source_import_id llega en el paso 7, cuando
-- existe customer_imports. NIT sin único (DM-4): solo índice de búsqueda.

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "crm_code" VARCHAR(30) NOT NULL,
    "customer_code" VARCHAR(40),
    "customer_code_normalized" VARCHAR(40),
    "legal_name" VARCHAR(200) NOT NULL,
    "legal_name_normalized" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(200),
    "tax_id" VARCHAR(30),
    "tax_id_normalized" VARCHAR(30),
    "country_id" UUID NOT NULL,
    "city" VARCHAR(120),
    "address" VARCHAR(300),
    "phone" VARCHAR(40),
    "email" VARCHAR(320),
    "company_type_id" UUID,
    "status_id" UUID NOT NULL,
    "rating_id" UUID,
    "sales_owner_id" UUID NOT NULL,
    "primary_contact_id" UUID,
    "source_import_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "job_title" VARCHAR(120),
    "phone" VARCHAR(40),
    "email" VARCHAR(320),
    "email_normalized" VARCHAR(320),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "comments" VARCHAR(1000),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_crm_code_key" ON "customers"("crm_code");

-- CreateIndex
CREATE INDEX "idx_customers_country_id_tax_id" ON "customers"("country_id", "tax_id_normalized");

-- CreateIndex
CREATE INDEX "idx_customers_sales_owner_id" ON "customers"("sales_owner_id");

-- CreateIndex
CREATE INDEX "idx_customers_status_id" ON "customers"("status_id");

-- CreateIndex
CREATE INDEX "idx_customers_country_id_city" ON "customers"("country_id", "city");

-- CreateIndex
CREATE INDEX "idx_customers_legal_name_normalized" ON "customers"("legal_name_normalized");

-- CreateIndex
CREATE INDEX "idx_customers_deleted_at" ON "customers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customers_country_customer_code" ON "customers"("country_id", "customer_code_normalized");

-- CreateIndex
CREATE INDEX "idx_contacts_customer_id_is_active" ON "contacts"("customer_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contacts_id_customer" ON "contacts"("id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contacts_customer_email" ON "contacts"("customer_id", "email_normalized");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_type_id_fkey" FOREIGN KEY ("company_type_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_sales_owner_id_fkey" FOREIGN KEY ("sales_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK circular (después de crear contacts y su único (id, customer_id)): el contacto
-- principal solo puede ser un contacto de ESTE cliente. Con primary_contact_id nulo no se
-- evalúa (MATCH SIMPLE). NO ACTION: SET NULL anularía también customers.id.
-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_primary_contact_id_id_fkey" FOREIGN KEY ("primary_contact_id", "id") REFERENCES "contacts"("id", "customer_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- =============================================================================
-- CHECK (escritos a mano: Prisma no los gestiona ni los detecta como deriva)
-- =============================================================================

-- AddCheckConstraint
ALTER TABLE "customers"
  ADD CONSTRAINT "ck_customers_customer_code_normalized" CHECK (("customer_code" IS NULL) = ("customer_code_normalized" IS NULL)),
  ADD CONSTRAINT "ck_customers_tax_id_normalized"       CHECK (("tax_id" IS NULL) = ("tax_id_normalized" IS NULL));
