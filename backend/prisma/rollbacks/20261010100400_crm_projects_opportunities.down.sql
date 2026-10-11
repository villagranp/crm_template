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
-- Rollback de 20261010100400_crm_projects_opportunities.
-- ADVERTENCIA: borra proyectos, oportunidades, historiales, productos asociados y
-- forecast. Prohibido sin respaldo tras el primer uso real. Requiere haber revertido
-- antes los pasos 8, 7 y 6.
DROP TABLE IF EXISTS "forecast_lines";
DROP TABLE IF EXISTS "project_products";
DROP TABLE IF EXISTS "opportunity_result_history";
DROP TABLE IF EXISTS "opportunity_results";
DROP TABLE IF EXISTS "opportunity_stage_history";
DROP TABLE IF EXISTS "opportunities";
DROP TABLE IF EXISTS "project_phase_history";
DROP TABLE IF EXISTS "projects";

DROP TYPE IF EXISTS "result_change_action";
DROP TYPE IF EXISTS "opportunity_outcome";
