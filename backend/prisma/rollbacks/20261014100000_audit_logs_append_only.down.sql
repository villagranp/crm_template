-- PROCEDIMIENTO DE ROLLBACK (docs/database/data-model.md §10.3), desde backend/:
--   1. Aplicar los .down.sql en orden INVERSO a las migraciones, hasta llegar a la
--      que se quiere revertir:
--        pnpm exec prisma db execute --file prisma/rollbacks/<migración>.down.sql --schema prisma/schema.prisma
--   2. Tras cada uno, retirar su migración del historial de Prisma:
--        DELETE FROM "_prisma_migrations" WHERE migration_name = '<migración>';
--      (`prisma migrate resolve --rolled-back` NO sirve: solo acepta migraciones
--      fallidas y con una aplicada responde P3012.)
--   Lo verifica backend/test/crm-rollbacks.e2e.spec.ts.
--
-- Rollback de 20261014100000_audit_logs_append_only (ADR-025). Sin pérdida de datos:
-- solo retira la protección de la bitácora en la base; audit_logs queda intacta y
-- vuelve a depender únicamente del código (y del REVOKE, si se aplicó).
DROP TRIGGER IF EXISTS "trg_audit_logs_delete_after_retention" ON "audit_logs";
DROP TRIGGER IF EXISTS "trg_audit_logs_no_truncate" ON "audit_logs";
DROP TRIGGER IF EXISTS "trg_audit_logs_no_update" ON "audit_logs";
DROP FUNCTION IF EXISTS "audit_logs_append_only"();
