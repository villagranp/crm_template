-- Rollback de 20261010100000_crm_data_scope_country. Sin pérdida de datos: las filas
-- con COUNTRY vuelven a leerse como TERRITORY. Hay que revertir también el código y
-- el contrato (DTOs, frontend) al mismo tiempo: el enum es parte de la API.
ALTER TYPE "data_scope" RENAME VALUE 'COUNTRY' TO 'TERRITORY';
