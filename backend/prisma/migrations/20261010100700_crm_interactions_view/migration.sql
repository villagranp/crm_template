-- =============================================================================
-- CRM Fase 0 — paso 8 de 00-modelo-de-datos.md §9: vista crm_interactions_v
--
-- Historial de interacciones DERIVADO (00 §2.12): UNION ALL de visitas y
-- actividades no eliminadas. Una sola fuente de verdad; cada visita (aunque se
-- haya reprogramado) y cada actividad aparecen UNA vez. Qué estados cuentan como
-- interacción lo decide la consulta con la semántica del catálogo (DM-22), no la
-- vista. Se lee con $queryRaw parametrizado desde un adaptador de lectura; no se
-- activa el preview "views" de Prisma, que además ignora la vista en la deriva.
-- Rollback: prisma/rollbacks/20261010100700_crm_interactions_view.down.sql
-- =============================================================================

-- CreateView
CREATE VIEW "crm_interactions_v" AS
SELECT 'VISIT'::text                                         AS source_type,
       v."id"                                                AS source_id,
       v."code"                                              AS source_code,
       COALESCE(v."actual_start_at", v."scheduled_start_at") AS occurred_at,
       NULL::uuid                                            AS type_id,
       v."status_id"                                         AS status_id,
       v."owner_id"                                          AS user_id,
       v."customer_id"                                       AS customer_id,
       v."project_id"                                        AS project_id,
       NULL::uuid                                            AS opportunity_id,
       v."objective"::text                                   AS subject,
       COALESCE(v."confirmation_summary", v."result_summary")::text AS summary,
       v."result_id"                                         AS result_id,
       v."next_action"                                       AS next_action,
       v."next_action_date"                                  AS next_action_date
  FROM "visits" v
UNION ALL
SELECT 'ACTIVITY'::text,
       a."id",
       a."code",
       COALESCE(a."completed_at", a."scheduled_at", a."due_at"),
       a."type_id",
       a."status_id",
       a."owner_id",
       a."customer_id",
       a."project_id",
       a."opportunity_id",
       a."subject"::text,
       COALESCE(a."summary", a."result_notes")::text,
       a."result_id",
       a."next_action",
       a."next_action_date"
  FROM "activities" a
 WHERE a."deleted_at" IS NULL;
