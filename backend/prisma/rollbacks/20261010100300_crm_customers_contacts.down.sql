-- Rollback de 20261010100300_crm_customers_contacts.
-- ADVERTENCIA: borra clientes y contactos. Prohibido sin respaldo tras el primer uso
-- real. Requiere haber revertido antes los pasos 8 a 5.
-- Primero la FK circular; después las tablas.
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_primary_contact_id_id_fkey";
DROP TABLE IF EXISTS "contacts";
DROP TABLE IF EXISTS "customers";
