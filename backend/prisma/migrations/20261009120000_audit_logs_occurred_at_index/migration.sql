-- Listado por defecto de la bitacora: sin filtros y por fecha descendente
-- (PLAN-ADMIN, D11). Aditiva y reversible:
--   DROP INDEX "idx_audit_logs_occurred_at";

-- CreateIndex
CREATE INDEX "idx_audit_logs_occurred_at" ON "audit_logs"("occurred_at");
