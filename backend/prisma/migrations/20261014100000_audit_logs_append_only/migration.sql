-- =============================================================================
-- CRM — paso 9 de 00-modelo-de-datos.md §9: audit_logs de solo inserción
-- (07-administracion.md D.1 y H.3, D-07.11, ADR-025).
--
-- SQL escrito a mano (`prisma migrate dev --create-only`): Prisma no gestiona
-- funciones ni disparadores, así que no aparecen en `schema.prisma` y no los
-- detecta como deriva (igual que los CHECK de la Fase 0).
--
--   * BEFORE UPDATE   (por fila)       → siempre rechaza.
--   * BEFORE TRUNCATE (por sentencia)  → siempre rechaza.
--   * BEFORE DELETE   (por fila)       → rechaza si la fila está dentro del periodo
--     de retención `auditoria.dias_retencion` (system_parameters). Si el parámetro
--     falta, no es un entero o es menor que el mínimo admitido (30), se usa 365:
--     el disparador nunca queda más permisivo por un parámetro ausente o inválido.
--     La purga de lo vencido sigue siendo posible.
--
-- El parámetro se lee del MISMO esquema que la tabla (TG_TABLE_SCHEMA), no del
-- `search_path` de la sesión; la función fija además su propio `search_path`
-- (`pg_catalog, pg_temp`) y califica las funciones que llama. El mensaje no revela datos de la fila.
-- SQLSTATE propio `AU001` para distinguir el rechazo de otros errores.
--
-- Despliegue (recomendado, ADR-025): además, el rol de la aplicación sin UPDATE,
-- DELETE ni TRUNCATE sobre audit_logs; la purga, con otro rol.
-- Rollback: prisma/rollbacks/20261014100000_audit_logs_append_only.down.sql
-- =============================================================================

-- CreateFunction
CREATE OR REPLACE FUNCTION "audit_logs_append_only"() RETURNS trigger
LANGUAGE plpgsql
-- search_path fijo: ningún objeto de un esquema de la sesión (p. ej. un
-- `format` o un operador `~` sombreados) se resuelve dentro de la función.
-- Todo lo que usa es de pg_catalog y la tabla va calificada con su esquema.
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  raw_value      text;
  retention_days integer := 365;
BEGIN
  IF TG_OP = 'DELETE' THEN
    EXECUTE pg_catalog.format('SELECT value FROM %I.system_parameters WHERE key = $1', TG_TABLE_SCHEMA)
      INTO raw_value
      USING 'auditoria.dias_retencion';
    raw_value := pg_catalog.btrim(raw_value);
    -- IF anidados: SQL no garantiza el cortocircuito de AND y 'abc'::integer fallaría.
    IF raw_value ~ '^[0-9]{1,6}$' THEN
      IF raw_value::integer >= 30 THEN
        retention_days := raw_value::integer;
      END IF;
    END IF;

    IF OLD.occurred_at >= pg_catalog.now() - pg_catalog.make_interval(days => retention_days) THEN
      RAISE EXCEPTION 'audit_logs es de solo inserción: no se puede borrar un registro dentro del periodo de retención (% días)', retention_days
        USING ERRCODE = 'AU001';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit_logs es de solo inserción: % no permitido', TG_OP
    USING ERRCODE = 'AU001';
END;
$$;

-- CreateTrigger
CREATE TRIGGER "trg_audit_logs_no_update"
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();

-- CreateTrigger
CREATE TRIGGER "trg_audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"();

-- CreateTrigger
CREATE TRIGGER "trg_audit_logs_delete_after_retention"
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
