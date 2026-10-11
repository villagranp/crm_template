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
