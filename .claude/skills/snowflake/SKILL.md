---
name: snowflake
description: Uso de Snowflake como plataforma analítica detrás de puertos de lectura (analytics, reporting, data products), sin tratarlo como base transaccional. Úsalo en reporting, analytics, integraciones o cargas batch.
---

# Snowflake

## Purpose

Aprovechar Snowflake para analítica, reporting e integraciones sin contaminar el modelo
transaccional ni la arquitectura.

## When to use

Consultas analíticas, reporting, data products, integraciones masivas, procesos batch.

## Required context

ADR-004 y ADR-015, puertos analíticos en `infrastructure/database/ports/`, configuración `SNOWFLAKE_*`.

## Inputs

Pregunta de negocio a responder, volumen esperado, frescura de datos requerida.

## Standards

- Snowflake es **fuente analítica**, no OLTP. No se usa para escrituras transaccionales
  ni para invariantes de negocio en tiempo real.
- Acceso tras puertos de lectura: `AnalyticsRepository`, `ReportingRepository`, `DataProvider`,
  `IntegrationRepository`.
- Consultas parametrizadas (`binds`), nunca concatenación de valores.
- Toda consulta declara: warehouse, límite de filas y timeout.
- Autenticación por key pair (`SNOWFLAKE_JWT`) preferida sobre password.
- El costo importa: cada consulta tiene un warehouse dimensionado y se evita el escaneo total.

## Process

1. Confirma que la pregunta es analítica y no transaccional. Si es transaccional → PostgreSQL.
2. Define el puerto de lectura con el modelo de salida en términos de negocio.
3. Escribe la consulta con filtros por partición/fecha, `LIMIT` y columnas explícitas.
4. Parametriza todos los valores de entrada.
5. Define timeout y comportamiento ante fallo: la indisponibilidad de Snowflake **no** debe
   tumbar funcionalidad transaccional.
6. Considera caché o materialización si la consulta es costosa y la frescura lo permite.
7. Documenta origen, frescura y significado de cada métrica expuesta.
8. Prueba con el adaptador sustituido; las pruebas no dependen de Snowflake real.

## Required checks

- [ ] ¿La necesidad es realmente analítica?
- [ ] ¿Acceso tras un puerto de lectura, sin filtrar el driver al dominio?
- [ ] ¿Consulta parametrizada, con columnas explícitas y `LIMIT`?
- [ ] ¿Warehouse, timeout y manejo de error definidos?
- [ ] ¿Sin mezclar la consulta dentro de una transacción OLTP?
- [ ] ¿Credenciales por configuración, con key pair y llave fuera de Git?
- [ ] ¿Frescura y origen documentados para el consumidor?
- [ ] ¿Sin PII innecesaria en los resultados expuestos?

## Expected output

Puerto analítico e implementación Snowflake, consulta acotada, documentación de la métrica
y pruebas con adaptador sustituido.

## Anti-patterns

- Tratar Snowflake como base transaccional del producto.
- `SELECT *` sobre tablas grandes sin filtro de partición.
- Consultas construidas por concatenación de strings.
- Que una caída de Snowflake rompa el login o un CRUD.
- Llave privada dentro del repositorio o de la imagen Docker.
- Duplicar reglas de negocio en SQL analítico y en el dominio.

## Definition of Done

La consulta responde la pregunta de negocio, está acotada en costo y tiempo, y su fallo
está aislado del flujo transaccional.

## Related Skills

`database`, `architecture`, `security`, `observability`, `adr`
