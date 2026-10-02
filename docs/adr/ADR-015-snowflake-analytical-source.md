# ADR-015 - Snowflake como fuente analítica

## Status
Accepted — 2026-09-22

## Context
La organización usa Snowflake como plataforma de datos. Existe el riesgo de tratarlo como una
base OLTP más, lo que degradaría rendimiento, costo y consistencia transaccional.

## Decision
Snowflake se integra exclusivamente como **fuente analítica de lectura**, detrás de puertos
específicos (`AnalyticsRepository`, `ReportingRepository`, `DataProvider`, `IntegrationRepository`).
No se usa para escrituras transaccionales ni para invariantes de negocio en tiempo real.
Se habilita por configuración (`SNOWFLAKE_ENABLED`) y su indisponibilidad no debe afectar
funcionalidad transaccional.

## Alternatives
- **Usar Snowflake como base principal**: inadecuado para cargas OLTP por latencia, concurrencia
  y modelo de costos.
- **Replicar datos analíticos a PostgreSQL**: evita la dependencia, pero duplica datos y añade un
  pipeline de sincronización que hay que operar.

## Consequences
- El sistema puede combinar PostgreSQL, Snowflake y APIs externas simultáneamente.
- Las consultas analíticas se aíslan, con su propio timeout y manejo de fallo.
- Coste: mantener dos modelos de acceso y documentar la frescura de cada métrica expuesta.

## Security Considerations
Autenticación por key pair, con la llave privada fuera del repositorio y de las imágenes.
Consultas parametrizadas y con límite. Los resultados expuestos no incluyen PII innecesaria.
