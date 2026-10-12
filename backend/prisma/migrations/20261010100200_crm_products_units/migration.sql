-- =============================================================================
-- CRM Fase 0 — paso 3 de 00-modelo-de-datos.md §9: unidades, familias, productos y reglas de conversión
--
-- SQL de Prisma generado con `prisma migrate diff` (schema anterior -> nuevo),
-- repartido por tabla entre los pasos de §9 y completado a mano con lo que
-- Prisma no expresa (CHECK). Prisma ignora los CHECK en la detección de
-- deriva, así que `migrate dev` no los borra.
-- Rollback: prisma/rollbacks/20261010100200_crm_products_units.down.sql
-- =============================================================================

-- CreateEnum
CREATE TYPE "unit_dimension" AS ENUM ('MASS', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "conversion_scope" AS ENUM ('GLOBAL', 'PRODUCT_FAMILY', 'PRODUCT', 'PROJECT_TYPE');

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "symbol" VARCHAR(12) NOT NULL,
    "dimension" "unit_dimension" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_families" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "product_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "family_id" UUID NOT NULL,
    "base_unit_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_conversion_rules" (
    "id" UUID NOT NULL,
    "from_unit_id" UUID NOT NULL,
    "to_unit_id" UUID NOT NULL,
    "factor" DECIMAL(19,8) NOT NULL,
    "scope" "conversion_scope" NOT NULL DEFAULT 'GLOBAL',
    "product_id" UUID,
    "product_family_id" UUID,
    "project_type_id" UUID,
    "scope_key" VARCHAR(40) NOT NULL,
    "description" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "unit_conversion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_code_key" ON "units_of_measure"("code");

-- CreateIndex
CREATE INDEX "idx_units_of_measure_is_active_sort_order" ON "units_of_measure"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_families_code_key" ON "product_families"("code");

-- CreateIndex
CREATE INDEX "idx_product_families_is_active_sort_order" ON "product_families"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "idx_products_family_id" ON "products"("family_id");

-- CreateIndex
CREATE INDEX "idx_products_is_active" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "idx_unit_conversion_rules_product_id" ON "unit_conversion_rules"("product_id");

-- CreateIndex
CREATE INDEX "idx_unit_conversion_rules_product_family_id" ON "unit_conversion_rules"("product_family_id");

-- CreateIndex
CREATE INDEX "idx_unit_conversion_rules_project_type_id" ON "unit_conversion_rules"("project_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_unit_conversion_rules_from_to_scope" ON "unit_conversion_rules"("from_unit_id", "to_unit_id", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_unit_conversion_rules_id_from_unit" ON "unit_conversion_rules"("id", "from_unit_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "product_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversion_rules" ADD CONSTRAINT "unit_conversion_rules_from_unit_id_fkey" FOREIGN KEY ("from_unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversion_rules" ADD CONSTRAINT "unit_conversion_rules_to_unit_id_fkey" FOREIGN KEY ("to_unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversion_rules" ADD CONSTRAINT "unit_conversion_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversion_rules" ADD CONSTRAINT "unit_conversion_rules_product_family_id_fkey" FOREIGN KEY ("product_family_id") REFERENCES "product_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversion_rules" ADD CONSTRAINT "unit_conversion_rules_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK (escritos a mano: Prisma no los gestiona ni los detecta como deriva)
-- =============================================================================

-- AddCheckConstraint
ALTER TABLE "unit_conversion_rules"
  ADD CONSTRAINT "ck_unit_conversion_rules_factor_positive" CHECK ("factor" > 0),
  -- La identidad TON->TON (factor 1) existe para que "tonelaje no nulo <=> regla no nula" valga también en toneladas.
  ADD CONSTRAINT "ck_unit_conversion_rules_identity" CHECK ("from_unit_id" <> "to_unit_id" OR "factor" = 1),
  -- scope_key reproduce la columna de ámbito: hace posible el único sin NULLS NOT DISTINCT.
  ADD CONSTRAINT "ck_unit_conversion_rules_scope" CHECK (
       ("scope" = 'GLOBAL'         AND "product_id" IS NULL AND "product_family_id" IS NULL AND "project_type_id" IS NULL AND "scope_key" = 'GLOBAL')
    OR ("scope" = 'PRODUCT'        AND "product_id" IS NOT NULL AND "product_family_id" IS NULL AND "project_type_id" IS NULL AND "scope_key" = "product_id"::text)
    OR ("scope" = 'PRODUCT_FAMILY' AND "product_family_id" IS NOT NULL AND "product_id" IS NULL AND "project_type_id" IS NULL AND "scope_key" = "product_family_id"::text)
    OR ("scope" = 'PROJECT_TYPE'   AND "project_type_id" IS NOT NULL AND "product_id" IS NULL AND "product_family_id" IS NULL AND "scope_key" = "project_type_id"::text)
  );
