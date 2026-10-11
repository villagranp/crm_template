-- Rollback de 20261010100500_crm_commercial_activity.
-- ADVERTENCIA: borra visitas, eventos, actividades y participantes. Prohibido sin
-- respaldo tras el primer uso real. Requiere haber revertido antes los pasos 8 y 7
-- (la vista y attachments dependen de estas tablas).
DROP TABLE IF EXISTS "interaction_participants";
DROP TABLE IF EXISTS "activities";
DROP TABLE IF EXISTS "visit_events";
DROP TABLE IF EXISTS "visits";

DROP TYPE IF EXISTS "participant_role";
DROP TYPE IF EXISTS "visit_event_type";
