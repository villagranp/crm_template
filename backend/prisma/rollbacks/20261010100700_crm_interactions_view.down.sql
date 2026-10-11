-- Rollback de 20261010100700_crm_interactions_view. Sin pérdida de datos (la vista es derivada).
-- Aplicar en orden inverso a las migraciones y retirar la fila correspondiente de
-- _prisma_migrations (o `prisma migrate resolve --rolled-back <migración>`).
DROP VIEW IF EXISTS "crm_interactions_v";
