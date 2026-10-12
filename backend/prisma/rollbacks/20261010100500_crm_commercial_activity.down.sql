-- PROCEDIMIENTO DE ROLLBACK (docs/database/data-model.md §10.3), desde backend/:
--   1. Aplicar los .down.sql en orden INVERSO a las migraciones (de 20261010100700 a
--      20261010100000), hasta llegar a la que se quiere revertir:
--        pnpm exec prisma db execute --file prisma/rollbacks/<migración>.down.sql --schema prisma/schema.prisma
--   2. Tras cada uno, retirar su migración del historial de Prisma:
--        DELETE FROM "_prisma_migrations" WHERE migration_name = '<migración>';
--      (`prisma migrate resolve --rolled-back` NO sirve: solo acepta migraciones
--      fallidas y con una aplicada responde P3012.)
--   Con datos reales del CRM, respaldo previo obligatorio. Lo verifica
--   backend/test/crm-rollbacks.e2e.spec.ts.
--
-- Rollback de 20261010100500_crm_commercial_activity.
-- ADVERTENCIA: borra visitas, eventos, actividades y participantes. Prohibido sin
-- respaldo tras el primer uso real. Requiere haber revertido antes los pasos 8 y 7
-- (la vista y attachments dependen de estas tablas).
DROP TABLE IF EXISTS "interaction_participants";
DROP TABLE IF EXISTS "activities";
DROP TABLE IF EXISTS "visit_events";
DROP TABLE IF EXISTS "visits";

DROP TYPE IF EXISTS "participant_role";
DROP TYPE IF EXISTS "visit_event_type";
