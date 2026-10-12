-- =============================================================================
-- CRM Fase 0 — paso 2 de 00-modelo-de-datos.md §9: monedas, tipos de cambio, países y extensión de users
--
-- SQL de Prisma generado con `prisma migrate diff` (schema anterior -> nuevo),
-- repartido por tabla entre los pasos de §9 y completado a mano con lo que
-- Prisma no expresa (CHECK). Prisma ignora los CHECK en la detección de
-- deriva, así que `migrate dev` no los borra.
-- Rollback: prisma/rollbacks/20261010100100_crm_countries_users.down.sql
-- =============================================================================
-- Único ALTER sobre una tabla con datos: users (columnas nulas sin default y
-- cambio de default de locale/time_zone: solo metadatos, sin reescritura; los
-- usuarios existentes conservan su valor, DM-2 / C12).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "country_id" UUID,
ADD COLUMN     "employee_code" VARCHAR(40),
ALTER COLUMN "locale" SET DEFAULT 'es-GT',
ALTER COLUMN "time_zone" SET DEFAULT 'America/Guatemala';

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "symbol" VARCHAR(8) NOT NULL,
    "decimals" SMALLINT NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "effective_date" DATE NOT NULL,
    "rate_per_usd" DECIMAL(19,8) NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "iso_code" CHAR(2) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone_prefix" VARCHAR(6),
    "tax_id_label" VARCHAR(40) NOT NULL DEFAULT 'NIT',
    "tax_id_pattern" VARCHAR(200),
    "phone_pattern" VARCHAR(200),
    "currency_code" CHAR(3) NOT NULL,
    "time_zone" VARCHAR(60),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_exchange_rates_currency_effective_date" ON "exchange_rates"("currency_code", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso_code_key" ON "countries"("iso_code");

-- CreateIndex
CREATE INDEX "idx_countries_is_active_sort_order" ON "countries"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE INDEX "idx_users_country_id" ON "users"("country_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK (escritos a mano: Prisma no los gestiona ni los detecta como deriva)
-- =============================================================================

-- AddCheckConstraint
ALTER TABLE "currencies"
  ADD CONSTRAINT "ck_currencies_code"     CHECK ("code" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "ck_currencies_decimals" CHECK ("decimals" BETWEEN 0 AND 4);

-- AddCheckConstraint
ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "ck_exchange_rates_rate"     CHECK ("rate_per_usd" > 0),
  -- El USD es la base: su tasa es siempre 1 y no se guarda (ADR-024).
  ADD CONSTRAINT "ck_exchange_rates_not_base" CHECK ("currency_code" <> 'USD');
