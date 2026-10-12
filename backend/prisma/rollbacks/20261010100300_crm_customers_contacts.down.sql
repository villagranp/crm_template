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
-- Rollback de 20261010100300_crm_customers_contacts.
-- ADVERTENCIA: borra clientes y contactos. Prohibido sin respaldo tras el primer uso
-- real. Requiere haber revertido antes los pasos 8 a 5.
-- Primero la FK circular; después las tablas.
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_primary_contact_id_id_fkey";
DROP TABLE IF EXISTS "contacts";
DROP TABLE IF EXISTS "customers";
