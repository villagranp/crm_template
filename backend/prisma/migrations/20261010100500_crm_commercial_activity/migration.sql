-- =============================================================================
-- CRM Fase 0 — paso 6 de 00-modelo-de-datos.md §9: visitas, eventos de visita, actividades y participantes
--
-- SQL de Prisma generado con `prisma migrate diff` (schema anterior -> nuevo),
-- repartido por tabla entre los pasos de §9 y completado a mano con lo que
-- Prisma no expresa (CHECK). Prisma ignora los CHECK en la detección de
-- deriva, así que `migrate dev` no los borra.
-- Rollback: prisma/rollbacks/20261010100500_crm_commercial_activity.down.sql
-- =============================================================================

-- CreateEnum
CREATE TYPE "visit_event_type" AS ENUM ('PLANNED', 'RESCHEDULED', 'COMPLETED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "participant_role" AS ENUM ('INVITED', 'ATTENDED');

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "project_id" UUID,
    "owner_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "scheduled_start_at" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_end_at" TIMESTAMPTZ(6),
    "objective" VARCHAR(1000) NOT NULL,
    "location" VARCHAR(300),
    "reminder_minutes_before" INTEGER,
    "original_scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "actual_start_at" TIMESTAMPTZ(6),
    "actual_end_at" TIMESTAMPTZ(6),
    "topics" TEXT,
    "agreements" TEXT,
    "result_id" UUID,
    "result_summary" VARCHAR(2000),
    "comments" VARCHAR(2000),
    "next_action" VARCHAR(300),
    "next_action_date" DATE,
    "completion_recorded_by_id" UUID,
    "completion_recorded_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by_id" UUID,
    "confirmation_summary" VARCHAR(2000),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_events" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "event_type" "visit_event_type" NOT NULL,
    "from_status_id" UUID,
    "to_status_id" UUID NOT NULL,
    "previous_scheduled_start_at" TIMESTAMPTZ(6),
    "new_scheduled_start_at" TIMESTAMPTZ(6),
    "reason_id" UUID,
    "reason_text" VARCHAR(1000),
    "comment" VARCHAR(2000),
    "performed_by_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "type_id" UUID NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "customer_id" UUID NOT NULL,
    "project_id" UUID,
    "opportunity_id" UUID,
    "owner_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "priority_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "duration_minutes" INTEGER,
    "summary" VARCHAR(2000),
    "result_id" UUID,
    "result_notes" VARCHAR(2000),
    "next_action" VARCHAR(300),
    "next_action_date" DATE,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_id" UUID,
    "completion_comment" VARCHAR(2000),
    "cancelled_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_participants" (
    "id" UUID NOT NULL,
    "visit_id" UUID,
    "activity_id" UUID,
    "customer_id" UUID NOT NULL,
    "role" "participant_role" NOT NULL DEFAULT 'INVITED',
    "contact_id" UUID,
    "user_id" UUID,
    "external_name" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "interaction_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visits_code_key" ON "visits"("code");

-- CreateIndex
CREATE INDEX "idx_visits_owner_id_scheduled_start_at" ON "visits"("owner_id", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "idx_visits_customer_id_scheduled_start_at" ON "visits"("customer_id", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "idx_visits_project_id" ON "visits"("project_id");

-- CreateIndex
CREATE INDEX "idx_visits_status_id_scheduled_start_at" ON "visits"("status_id", "scheduled_start_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_visits_id_customer" ON "visits"("id", "customer_id");

-- CreateIndex
CREATE INDEX "idx_visit_events_visit_id_occurred_at" ON "visit_events"("visit_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "activities_code_key" ON "activities"("code");

-- CreateIndex
CREATE INDEX "idx_activities_owner_id_status_id_due_at" ON "activities"("owner_id", "status_id", "due_at");

-- CreateIndex
CREATE INDEX "idx_activities_customer_id_scheduled_at" ON "activities"("customer_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "idx_activities_project_id" ON "activities"("project_id");

-- CreateIndex
CREATE INDEX "idx_activities_opportunity_id" ON "activities"("opportunity_id");

-- CreateIndex
CREATE INDEX "idx_activities_type_id" ON "activities"("type_id");

-- CreateIndex
CREATE INDEX "idx_activities_deleted_at" ON "activities"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_activities_id_customer" ON "activities"("id", "customer_id");

-- CreateIndex
CREATE INDEX "idx_interaction_participants_visit_id" ON "interaction_participants"("visit_id");

-- CreateIndex
CREATE INDEX "idx_interaction_participants_activity_id" ON "interaction_participants"("activity_id");

-- CreateIndex
CREATE INDEX "idx_interaction_participants_contact_id" ON "interaction_participants"("contact_id");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_project_id_customer_id_fkey" FOREIGN KEY ("project_id", "customer_id") REFERENCES "projects"("id", "customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_completion_recorded_by_id_fkey" FOREIGN KEY ("completion_recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_customer_id_fkey" FOREIGN KEY ("project_id", "customer_id") REFERENCES "projects"("id", "customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_project_id_fkey" FOREIGN KEY ("opportunity_id", "project_id") REFERENCES "opportunities"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_visit_id_customer_id_fkey" FOREIGN KEY ("visit_id", "customer_id") REFERENCES "visits"("id", "customer_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_activity_id_customer_id_fkey" FOREIGN KEY ("activity_id", "customer_id") REFERENCES "activities"("id", "customer_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_contact_id_customer_id_fkey" FOREIGN KEY ("contact_id", "customer_id") REFERENCES "contacts"("id", "customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK (escritos a mano: Prisma no los gestiona ni los detecta como deriva)
-- =============================================================================

-- AddCheckConstraint
ALTER TABLE "visits"
  ADD CONSTRAINT "ck_visits_scheduled_range"   CHECK ("scheduled_end_at" IS NULL OR "scheduled_end_at" >= "scheduled_start_at"),
  ADD CONSTRAINT "ck_visits_actual_range"      CHECK ("actual_end_at" IS NULL OR ("actual_start_at" IS NOT NULL AND "actual_end_at" >= "actual_start_at")),
  ADD CONSTRAINT "ck_visits_confirm_requires"  CHECK ("confirmed_at" IS NULL OR ("actual_start_at" IS NOT NULL AND "confirmed_by_id" IS NOT NULL
                                                     AND ("confirmation_summary" IS NOT NULL OR "result_summary" IS NOT NULL OR "comments" IS NOT NULL))),
  -- DM-20: confirma el propio asesor dueño de la visita, no el manager.
  ADD CONSTRAINT "ck_visits_confirmed_by_owner" CHECK ("confirmed_by_id" IS NULL OR "confirmed_by_id" = "owner_id"),
  ADD CONSTRAINT "ck_visits_reschedule_count"  CHECK ("reschedule_count" >= 0),
  ADD CONSTRAINT "ck_visits_reminder"          CHECK ("reminder_minutes_before" IS NULL OR "reminder_minutes_before" >= 0);

-- AddCheckConstraint
ALTER TABLE "visit_events"
  ADD CONSTRAINT "ck_visit_events_reschedule" CHECK ("event_type" <> 'RESCHEDULED'
                                                     OR ("previous_scheduled_start_at" IS NOT NULL AND "new_scheduled_start_at" IS NOT NULL)),
  ADD CONSTRAINT "ck_visit_events_reason"     CHECK ("event_type" NOT IN ('RESCHEDULED', 'CANCELLED')
                                                     OR "reason_id" IS NOT NULL OR "reason_text" IS NOT NULL);

-- AddCheckConstraint
ALTER TABLE "activities"
  ADD CONSTRAINT "ck_activities_opportunity_needs_project" CHECK ("opportunity_id" IS NULL OR "project_id" IS NOT NULL),
  ADD CONSTRAINT "ck_activities_duration"   CHECK ("duration_minutes" IS NULL OR "duration_minutes" >= 0),
  -- "Exigir resultado para completar" (ALCANCE §6.6.3).
  ADD CONSTRAINT "ck_activities_completion" CHECK ("completed_at" IS NULL OR ("completed_by_id" IS NOT NULL
                                                   AND ("result_id" IS NOT NULL OR "result_notes" IS NOT NULL)));

-- AddCheckConstraint
ALTER TABLE "interaction_participants"
  ADD CONSTRAINT "ck_interaction_participants_parent"  CHECK (num_nonnulls("visit_id", "activity_id") = 1),
  ADD CONSTRAINT "ck_interaction_participants_subject" CHECK (num_nonnulls("contact_id", "user_id", "external_name") = 1);
