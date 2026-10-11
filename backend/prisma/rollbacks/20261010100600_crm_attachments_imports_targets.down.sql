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
-- Rollback de 20261010100600_crm_attachments_imports_targets.
-- ADVERTENCIA: borra adjuntos (vínculos), importaciones y metas. Tras el primer uso
-- real del CRM está prohibido sin respaldo previo (docs/database/data-model.md §CRM).
-- Requiere haber revertido antes 20261010100700_crm_interactions_view.
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_source_import_id_fkey";

DROP TABLE IF EXISTS "sales_targets";
DROP TABLE IF EXISTS "attachments";
DROP TABLE IF EXISTS "customer_import_rows";
DROP TABLE IF EXISTS "customer_imports";

DROP TYPE IF EXISTS "sales_target_metric";
DROP TYPE IF EXISTS "import_row_status";
DROP TYPE IF EXISTS "import_status";
DROP TYPE IF EXISTS "import_file_format";
