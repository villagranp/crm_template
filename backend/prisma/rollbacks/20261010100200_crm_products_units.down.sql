-- Rollback de 20261010100200_crm_products_units.
-- ADVERTENCIA: borra unidades, familias, productos y reglas de conversión (datos de
-- configuración sembrados). Requiere haber revertido antes los pasos 8 a 4.
DROP TABLE IF EXISTS "unit_conversion_rules";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "product_families";
DROP TABLE IF EXISTS "units_of_measure";

DROP TYPE IF EXISTS "conversion_scope";
DROP TYPE IF EXISTS "unit_dimension";
