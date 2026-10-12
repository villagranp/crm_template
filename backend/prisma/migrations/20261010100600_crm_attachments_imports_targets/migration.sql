-- =============================================================================
-- CRM Fase 0 — paso 7 de 00-modelo-de-datos.md §9: adjuntos, importación de clientes y metas comerciales
--
-- SQL de Prisma generado con `prisma migrate diff` (schema anterior -> nuevo),
-- repartido por tabla entre los pasos de §9 y completado a mano con lo que
-- Prisma no expresa (CHECK y la FK customers.source_import_id). Prisma ignora los CHECK en la detección de
-- deriva, así que `migrate dev` no los borra.
-- Rollback: prisma/rollbacks/20261010100600_crm_attachments_imports_targets.down.sql
-- =============================================================================

-- CreateEnum
CREATE TYPE "import_file_format" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('UPLOADED', 'VALIDATING', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "import_row_status" AS ENUM ('PENDING', 'VALID', 'INVALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING', 'IMPORTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "sales_target_metric" AS ENUM ('TONNAGE', 'AMOUNT', 'WON_OPPORTUNITIES', 'VISITS', 'ACTIVITIES');

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "stored_file_id" UUID NOT NULL,
    "customer_id" UUID,
    "project_id" UUID,
    "visit_id" UUID,
    "visit_event_id" UUID,
    "activity_id" UUID,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_imports" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "format" "import_file_format" NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "source_file_id" UUID,
    "error_file_id" UUID,
    "status" "import_status" NOT NULL DEFAULT 'UPLOADED',
    "template_version" VARCHAR(20),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(500),
    "started_by_id" UUID NOT NULL,
    "validated_at" TIMESTAMPTZ(6),
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_import_rows" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "status" "import_row_status" NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "duplicate_of_customer_id" UUID,
    "duplicate_of_row_number" INTEGER,
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" UUID NOT NULL,
    "metric" "sales_target_metric" NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT,
    "user_id" UUID,
    "team_id" UUID,
    "country_id" UUID,
    "product_family_id" UUID,
    "target_value" DECIMAL(19,4) NOT NULL,
    "notes" VARCHAR(500),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attachments_stored_file_id_key" ON "attachments"("stored_file_id");

-- CreateIndex
CREATE INDEX "idx_attachments_customer_id" ON "attachments"("customer_id");

-- CreateIndex
CREATE INDEX "idx_attachments_project_id" ON "attachments"("project_id");

-- CreateIndex
CREATE INDEX "idx_attachments_visit_id" ON "attachments"("visit_id");

-- CreateIndex
CREATE INDEX "idx_attachments_visit_event_id" ON "attachments"("visit_event_id");

-- CreateIndex
CREATE INDEX "idx_attachments_activity_id" ON "attachments"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_imports_code_key" ON "customer_imports"("code");

-- CreateIndex
CREATE INDEX "idx_customer_imports_started_by_id_created_at" ON "customer_imports"("started_by_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_customer_imports_status_created_at" ON "customer_imports"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_customer_import_rows_import_id_status" ON "customer_import_rows"("import_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_import_rows_import_row" ON "customer_import_rows"("import_id", "row_number");

-- CreateIndex
CREATE INDEX "idx_sales_targets_year_month" ON "sales_targets"("year", "month");

-- CreateIndex
CREATE INDEX "idx_sales_targets_user_id" ON "sales_targets"("user_id");

-- CreateIndex
CREATE INDEX "idx_sales_targets_team_id" ON "sales_targets"("team_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "customer_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_stored_file_id_fkey" FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_visit_event_id_fkey" FOREIGN KEY ("visit_event_id") REFERENCES "visit_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_imports" ADD CONSTRAINT "customer_imports_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_imports" ADD CONSTRAINT "customer_imports_error_file_id_fkey" FOREIGN KEY ("error_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_imports" ADD CONSTRAINT "customer_imports_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_imports" ADD CONSTRAINT "customer_imports_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_import_rows" ADD CONSTRAINT "customer_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "customer_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_import_rows" ADD CONSTRAINT "customer_import_rows_duplicate_of_customer_id_fkey" FOREIGN KEY ("duplicate_of_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_import_rows" ADD CONSTRAINT "customer_import_rows_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_product_family_id_fkey" FOREIGN KEY ("product_family_id") REFERENCES "product_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK (escritos a mano: Prisma no los gestiona ni los detecta como deriva)
-- =============================================================================

-- AddCheckConstraint
ALTER TABLE "attachments"
  ADD CONSTRAINT "ck_attachments_single_owner" CHECK (num_nonnulls("customer_id", "project_id", "visit_id", "visit_event_id", "activity_id") = 1);

-- AddCheckConstraint
ALTER TABLE "customer_imports"
  ADD CONSTRAINT "ck_customer_imports_counters" CHECK ("total_rows" >= 0 AND "valid_rows" >= 0 AND "invalid_rows" >= 0 AND "imported_rows" >= 0
                                                       AND "valid_rows" + "invalid_rows" <= "total_rows" AND "imported_rows" <= "valid_rows");

-- AddCheckConstraint
ALTER TABLE "customer_import_rows"
  ADD CONSTRAINT "ck_customer_import_rows_row_number" CHECK ("row_number" >= 1),
  ADD CONSTRAINT "ck_customer_import_rows_imported"   CHECK (("status" = 'IMPORTED') = ("customer_id" IS NOT NULL));

-- AddCheckConstraint
ALTER TABLE "sales_targets"
  ADD CONSTRAINT "ck_sales_targets_subject" CHECK (num_nonnulls("user_id", "team_id", "country_id") = 1),
  ADD CONSTRAINT "ck_sales_targets_month"   CHECK ("month" IS NULL OR "month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "ck_sales_targets_value"   CHECK ("target_value" >= 0);
