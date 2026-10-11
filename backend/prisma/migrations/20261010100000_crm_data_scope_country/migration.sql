-- =============================================================================
-- CRM Fase 0 — paso 1 de 00-modelo-de-datos.md §9: DataScope TERRITORY -> COUNTRY
--
-- ÚNICA migración no aditiva de la Fase 0 (DM-10; addendum de 2026-10-10 a
-- ADR-018). Escrita a mano: Prisma generaría CREATE TYPE nuevo + ALTER COLUMN
-- ... USING + DROP TYPE, que falla si alguna fila usa el valor renombrado.
-- RENAME VALUE es atómico, instantáneo (solo catálogo) y conserva las filas.
-- Ningún rol sembrado usa TERRITORY.
-- Rollback: prisma/rollbacks/20261010100000_crm_data_scope_country.down.sql
-- =============================================================================

-- AlterEnum
ALTER TYPE "data_scope" RENAME VALUE 'TERRITORY' TO 'COUNTRY';
