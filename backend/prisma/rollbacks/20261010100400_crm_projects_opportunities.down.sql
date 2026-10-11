-- Rollback de 20261010100400_crm_projects_opportunities.
-- ADVERTENCIA: borra proyectos, oportunidades, historiales, productos asociados y
-- forecast. Prohibido sin respaldo tras el primer uso real. Requiere haber revertido
-- antes los pasos 8, 7 y 6.
DROP TABLE IF EXISTS "forecast_lines";
DROP TABLE IF EXISTS "project_products";
DROP TABLE IF EXISTS "opportunity_result_history";
DROP TABLE IF EXISTS "opportunity_results";
DROP TABLE IF EXISTS "opportunity_stage_history";
DROP TABLE IF EXISTS "opportunities";
DROP TABLE IF EXISTS "project_phase_history";
DROP TABLE IF EXISTS "projects";

DROP TYPE IF EXISTS "result_change_action";
DROP TYPE IF EXISTS "opportunity_outcome";
