# ADR-016 - Observabilidad y correlation ID

## Status
Accepted — 2026-09-22

## Context
Diagnosticar incidentes exige correlacionar lo ocurrido en el frontend, NGINX, la API y las
dependencias, sin exponer datos sensibles y sin instalar por adelantado toda una plataforma
de observabilidad.

## Decision
Logging estructurado en JSON con `correlationId` en cada entrada. Middleware que preserva
`X-Correlation-ID` entrante cuando es seguro o genera uno nuevo, lo devuelve en la respuesta y
lo incluye en el cuerpo de error. Endpoints `GET /api/v1/health` (liveness, sin dependencias) y
`GET /api/v1/ready` (readiness, verifica dependencias críticas). Diseño compatible con
OpenTelemetry, Application Insights, Prometheus y Grafana, sin instalarlos en la Foundation.

## Alternatives
- **Instalar OpenTelemetry completo desde el inicio**: capacidad inmediata de trazas, a cambio de
  dependencias e infraestructura que ningún proyecto necesita todavía (YAGNI).
- **Logging plano en texto**: fácil de leer localmente, inutilizable para agregación y búsqueda.

## Consequences
- Cualquier request es rastreable de punta a punta desde el primer día.
- Adoptar tracing distribuido después es incremental, no un rediseño.
- Coste: disciplina para no loggear datos sensibles y para no duplicar el log del mismo error.

## Security Considerations
Lista explícita de campos redactados: passwords, tokens, cookies, secretos y PII.
Los eventos de seguridad (login fallido, `403`, rate limit excedido) se registran sin exponer
credenciales. El `correlationId` es opaco y no contiene información del usuario.
