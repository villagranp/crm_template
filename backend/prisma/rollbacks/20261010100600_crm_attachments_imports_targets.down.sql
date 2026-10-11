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
