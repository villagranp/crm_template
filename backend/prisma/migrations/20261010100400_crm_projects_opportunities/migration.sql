-- =============================================================================
-- CRM Fase 0 — paso 5 de 00-modelo-de-datos.md §9: proyectos, oportunidades, resultados, productos asociados y forecast
--
-- SQL de Prisma generado con `prisma migrate diff` (schema anterior -> nuevo),
-- repartido por tabla entre los pasos de §9 y completado a mano con lo que
-- Prisma no expresa (CHECK). Prisma ignora los CHECK en la detección de
-- deriva, así que `migrate dev` no los borra.
-- Rollback: prisma/rollbacks/20261010100400_crm_projects_opportunities.down.sql
-- =============================================================================

-- CreateEnum
CREATE TYPE "opportunity_outcome" AS ENUM ('WON', 'LOST', 'PARTIAL');

-- CreateEnum
CREATE TYPE "result_change_action" AS ENUM ('RECORDED', 'CHANGED', 'CLEARED');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "city" VARCHAR(120),
    "address" VARCHAR(300),
    "description" TEXT,
    "estimated_start_date" DATE,
    "estimated_end_date" DATE,
    "estimated_decision_date" DATE,
    "owner_id" UUID NOT NULL,
    "project_type_id" UUID,
    "sector_id" UUID,
    "measure_unit_id" UUID,
    "estimated_quantity" DECIMAL(19,4),
    "conversion_rule_id" UUID,
    "conversion_factor" DECIMAL(19,8),
    "estimated_tonnage" DECIMAL(19,4),
    "phase_id" UUID NOT NULL,
    "phase_progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "phase_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phase_comment" VARCHAR(1000),
    "duplicated_from_id" UUID,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_phase_history" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "from_phase_id" UUID,
    "to_phase_id" UUID NOT NULL,
    "from_progress" DECIMAL(5,2),
    "to_progress" DECIMAL(5,2) NOT NULL,
    "comment" VARCHAR(1000),
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_phase_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "project_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "opportunity_date" DATE NOT NULL,
    "owner_id" UUID NOT NULL,
    "estimated_amount" DECIMAL(19,4),
    "currency_code" CHAR(3),
    "exchange_rate" DECIMAL(19,8),
    "exchange_rate_date" DATE,
    "estimated_amount_usd" DECIMAL(19,4),
    "estimated_tonnage" DECIMAL(19,4),
    "description" VARCHAR(2000),
    "next_action" VARCHAR(300),
    "next_action_date" DATE,
    "stage_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stage_history" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "comment" VARCHAR(1000),
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_results" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "outcome" "opportunity_outcome" NOT NULL,
    "reason_id" UUID,
    "awarded_percent" DECIMAL(5,2),
    "decision_date" DATE NOT NULL,
    "comments" VARCHAR(2000),
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "opportunity_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_result_history" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "action" "result_change_action" NOT NULL,
    "outcome" "opportunity_outcome",
    "reason_id" UUID,
    "awarded_percent" DECIMAL(5,2),
    "decision_date" DATE,
    "comments" VARCHAR(2000),
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_result_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_products" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unit_id" UUID NOT NULL,
    "conversion_rule_id" UUID,
    "conversion_factor" DECIMAL(19,8),
    "tonnage" DECIMAL(19,4),
    "status_id" UUID NOT NULL,
    "notes" VARCHAR(1000),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "project_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_lines" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unit_id" UUID NOT NULL,
    "conversion_rule_id" UUID,
    "conversion_factor" DECIMAL(19,8),
    "tonnage" DECIMAL(19,4),
    "owner_id" UUID NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "forecast_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "idx_projects_customer_id" ON "projects"("customer_id");

-- CreateIndex
CREATE INDEX "idx_projects_owner_id" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "idx_projects_country_id" ON "projects"("country_id");

-- CreateIndex
CREATE INDEX "idx_projects_phase_id" ON "projects"("phase_id");

-- CreateIndex
CREATE INDEX "idx_projects_project_type_id" ON "projects"("project_type_id");

-- CreateIndex
CREATE INDEX "idx_projects_estimated_decision_date" ON "projects"("estimated_decision_date");

-- CreateIndex
CREATE INDEX "idx_projects_last_activity_at" ON "projects"("last_activity_at");

-- CreateIndex
CREATE INDEX "idx_projects_deleted_at" ON "projects"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_projects_id_customer" ON "projects"("id", "customer_id");

-- CreateIndex
CREATE INDEX "idx_project_phase_history_project_id_changed_at" ON "project_phase_history"("project_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_code_key" ON "opportunities"("code");

-- CreateIndex
CREATE INDEX "idx_opportunities_project_id" ON "opportunities"("project_id");

-- CreateIndex
CREATE INDEX "idx_opportunities_owner_id_stage_id" ON "opportunities"("owner_id", "stage_id");

-- CreateIndex
CREATE INDEX "idx_opportunities_stage_id" ON "opportunities"("stage_id");

-- CreateIndex
CREATE INDEX "idx_opportunities_next_action_date" ON "opportunities"("next_action_date");

-- CreateIndex
CREATE INDEX "idx_opportunities_deleted_at" ON "opportunities"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_opportunities_id_project" ON "opportunities"("id", "project_id");

-- CreateIndex
CREATE INDEX "idx_opportunity_stage_history_opportunity_id_changed_at" ON "opportunity_stage_history"("opportunity_id", "changed_at");

-- CreateIndex
CREATE INDEX "idx_opportunity_stage_history_to_stage_id_changed_at" ON "opportunity_stage_history"("to_stage_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_results_opportunity_id_key" ON "opportunity_results"("opportunity_id");

-- CreateIndex
CREATE INDEX "idx_opportunity_results_outcome_decision_date" ON "opportunity_results"("outcome", "decision_date");

-- CreateIndex
CREATE INDEX "idx_opportunity_result_history_opportunity_id_changed_at" ON "opportunity_result_history"("opportunity_id", "changed_at");

-- CreateIndex
CREATE INDEX "idx_project_products_project_id" ON "project_products"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_products_opportunity_id" ON "project_products"("opportunity_id");

-- CreateIndex
CREATE INDEX "idx_project_products_product_id" ON "project_products"("product_id");

-- CreateIndex
CREATE INDEX "idx_forecast_lines_year_month" ON "forecast_lines"("year", "month");

-- CreateIndex
CREATE INDEX "idx_forecast_lines_owner_id_year_month" ON "forecast_lines"("owner_id", "year", "month");

-- CreateIndex
CREATE INDEX "idx_forecast_lines_product_id_year_month" ON "forecast_lines"("product_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "uq_forecast_lines_project_product_period" ON "forecast_lines"("project_id", "product_id", "year", "month");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_measure_unit_id_fkey" FOREIGN KEY ("measure_unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_conversion_rule_id_measure_unit_id_fkey" FOREIGN KEY ("conversion_rule_id", "measure_unit_id") REFERENCES "unit_conversion_rules"("id", "from_unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_duplicated_from_id_fkey" FOREIGN KEY ("duplicated_from_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phase_history" ADD CONSTRAINT "project_phase_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phase_history" ADD CONSTRAINT "project_phase_history_from_phase_id_fkey" FOREIGN KEY ("from_phase_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phase_history" ADD CONSTRAINT "project_phase_history_to_phase_id_fkey" FOREIGN KEY ("to_phase_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phase_history" ADD CONSTRAINT "project_phase_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_results" ADD CONSTRAINT "opportunity_results_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_results" ADD CONSTRAINT "opportunity_results_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_results" ADD CONSTRAINT "opportunity_results_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_result_history" ADD CONSTRAINT "opportunity_result_history_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_result_history" ADD CONSTRAINT "opportunity_result_history_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_result_history" ADD CONSTRAINT "opportunity_result_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_opportunity_id_project_id_fkey" FOREIGN KEY ("opportunity_id", "project_id") REFERENCES "opportunities"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_conversion_rule_id_unit_id_fkey" FOREIGN KEY ("conversion_rule_id", "unit_id") REFERENCES "unit_conversion_rules"("id", "from_unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_conversion_rule_id_unit_id_fkey" FOREIGN KEY ("conversion_rule_id", "unit_id") REFERENCES "unit_conversion_rules"("id", "from_unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK (escritos a mano: Prisma no los gestiona ni los detecta como deriva)
-- =============================================================================

-- AddCheckConstraint
ALTER TABLE "projects"
  ADD CONSTRAINT "ck_projects_phase_progress"     CHECK ("phase_progress" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ck_projects_estimated_dates"    CHECK ("estimated_end_date" IS NULL OR "estimated_start_date" IS NULL OR "estimated_end_date" >= "estimated_start_date"),
  ADD CONSTRAINT "ck_projects_quantity"           CHECK ("estimated_quantity" IS NULL OR "estimated_quantity" >= 0),
  ADD CONSTRAINT "ck_projects_tonnage"            CHECK ("estimated_tonnage" IS NULL OR "estimated_tonnage" >= 0),
  ADD CONSTRAINT "ck_projects_conversion"         CHECK ("conversion_rule_id" IS NULL OR ("measure_unit_id" IS NOT NULL AND "estimated_quantity" IS NOT NULL AND "conversion_factor" IS NOT NULL)),
  ADD CONSTRAINT "ck_projects_not_self_duplicate" CHECK ("duplicated_from_id" IS NULL OR "duplicated_from_id" <> "id");

-- AddCheckConstraint
ALTER TABLE "project_phase_history"
  ADD CONSTRAINT "ck_project_phase_history_progress" CHECK ("to_progress" BETWEEN 0 AND 100 AND ("from_progress" IS NULL OR "from_progress" BETWEEN 0 AND 100));

-- AddCheckConstraint
ALTER TABLE "opportunities"
  ADD CONSTRAINT "ck_opportunities_amount"        CHECK ("estimated_amount" IS NULL OR "estimated_amount" >= 0),
  -- DM-36: monto, moneda, tipo de cambio y equivalente USD van juntos (todos o ninguno).
  ADD CONSTRAINT "ck_opportunities_amount_set"    CHECK (num_nonnulls("estimated_amount", "currency_code", "exchange_rate", "estimated_amount_usd") IN (0, 4)),
  ADD CONSTRAINT "ck_opportunities_exchange_rate" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "ck_opportunities_amount_usd"    CHECK ("estimated_amount_usd" IS NULL OR "estimated_amount_usd" >= 0),
  -- En USD el tipo de cambio es 1, sin fecha de vigencia, y el equivalente es el propio monto.
  ADD CONSTRAINT "ck_opportunities_usd_identity"  CHECK ("currency_code" IS DISTINCT FROM 'USD'
                                                         OR ("exchange_rate" = 1 AND "exchange_rate_date" IS NULL AND "estimated_amount_usd" = "estimated_amount")),
  ADD CONSTRAINT "ck_opportunities_rate_date"     CHECK ("currency_code" IS NULL OR "currency_code" = 'USD' OR "exchange_rate_date" IS NOT NULL),
  ADD CONSTRAINT "ck_opportunities_tonnage"       CHECK ("estimated_tonnage" IS NULL OR "estimated_tonnage" >= 0);

-- AddCheckConstraint
ALTER TABLE "opportunity_results"
  ADD CONSTRAINT "ck_opportunity_results_lost_reason"     CHECK ("outcome" <> 'LOST' OR "reason_id" IS NOT NULL),
  ADD CONSTRAINT "ck_opportunity_results_partial_percent" CHECK ("outcome" <> 'PARTIAL' OR "awarded_percent" IS NOT NULL),
  ADD CONSTRAINT "ck_opportunity_results_percent_range"   CHECK ("awarded_percent" IS NULL OR "awarded_percent" BETWEEN 0 AND 100);

-- AddCheckConstraint
ALTER TABLE "opportunity_result_history"
  ADD CONSTRAINT "ck_opportunity_result_history_payload" CHECK (
    "action" = 'CLEARED' OR ("outcome" IS NOT NULL AND "decision_date" IS NOT NULL
      AND ("outcome" <> 'LOST' OR "reason_id" IS NOT NULL)
      AND ("outcome" <> 'PARTIAL' OR "awarded_percent" IS NOT NULL))),
  ADD CONSTRAINT "ck_opportunity_result_history_percent" CHECK ("awarded_percent" IS NULL OR "awarded_percent" BETWEEN 0 AND 100);

-- AddCheckConstraint
ALTER TABLE "project_products"
  ADD CONSTRAINT "ck_project_products_quantity"   CHECK ("quantity" >= 0),
  ADD CONSTRAINT "ck_project_products_tonnage"    CHECK ("tonnage" IS NULL OR "tonnage" >= 0),
  -- Tonelaje solo con regla aplicada (DM-24: sin tonelaje manual en líneas).
  ADD CONSTRAINT "ck_project_products_conversion" CHECK (("tonnage" IS NULL) = ("conversion_rule_id" IS NULL)
                                                     AND ("conversion_factor" IS NULL) = ("conversion_rule_id" IS NULL));

-- AddCheckConstraint
ALTER TABLE "forecast_lines"
  ADD CONSTRAINT "ck_forecast_lines_month"      CHECK ("month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "ck_forecast_lines_year"       CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "ck_forecast_lines_quantity"   CHECK ("quantity" >= 0),
  ADD CONSTRAINT "ck_forecast_lines_tonnage"    CHECK ("tonnage" IS NULL OR "tonnage" >= 0),
  ADD CONSTRAINT "ck_forecast_lines_conversion" CHECK (("tonnage" IS NULL) = ("conversion_rule_id" IS NULL)
                                                  AND ("conversion_factor" IS NULL) = ("conversion_rule_id" IS NULL));
