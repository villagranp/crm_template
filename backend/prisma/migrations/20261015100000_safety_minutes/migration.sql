-- =============================================================================
-- Ajustes 1 (AJ1-2) — minuto de seguridad: un mensaje institucional por fecha.
-- Migración aditiva (docs/implementation-plans/AJUSTES-1.md §5.1). Sin datos personales
-- (clasificación: interno). `created_by_id`/`updated_by_id` sin FK, como `exchange_rates`.
-- =============================================================================

-- CreateTable
CREATE TABLE "safety_minutes" (
    "id" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "display_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "safety_minutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_safety_minutes_display_date" ON "safety_minutes"("display_date");

-- AddCheckConstraint (SQL a mano: Prisma no modela CHECK ni los detecta como deriva)
ALTER TABLE "safety_minutes"
  ADD CONSTRAINT "ck_safety_minutes_message_not_blank" CHECK (btrim("message") <> '');
