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
-- Rollback de 20261010100100_crm_countries_users.
-- ADVERTENCIA: borra países, monedas y tipos de cambio, y el código de colaborador y
-- el país de cada usuario. Requiere haber revertido antes los pasos 8 a 3.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_country_id_fkey";
DROP INDEX IF EXISTS "idx_users_country_id";
DROP INDEX IF EXISTS "users_employee_code_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "country_id",
DROP COLUMN IF EXISTS "employee_code",
ALTER COLUMN "locale" SET DEFAULT 'es-MX',
ALTER COLUMN "time_zone" SET DEFAULT 'America/Mexico_City';

DROP TABLE IF EXISTS "countries";
DROP TABLE IF EXISTS "exchange_rates";
DROP TABLE IF EXISTS "currencies";
