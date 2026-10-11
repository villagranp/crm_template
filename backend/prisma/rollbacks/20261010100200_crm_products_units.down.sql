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
-- Rollback de 20261010100200_crm_products_units.
-- ADVERTENCIA: borra unidades, familias, productos y reglas de conversión (datos de
-- configuración sembrados). Requiere haber revertido antes los pasos 8 a 4.
DROP TABLE IF EXISTS "unit_conversion_rules";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "product_families";
DROP TABLE IF EXISTS "units_of_measure";

DROP TYPE IF EXISTS "conversion_scope";
DROP TYPE IF EXISTS "unit_dimension";
