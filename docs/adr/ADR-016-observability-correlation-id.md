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

## Addendum 2026-10-20 — Evento `rate_limited` y sondas mínimas

Endurecimiento para exponer la plataforma a internet
([plan](../security/plan-exposicion-internet.md) §2, brecha ASVS G-26). La decisión no cambia.

**Evento `rate_limited`.** Cada respuesta `429` emite un log estructurado de nivel `warn` desde
`AllExceptionsFilter` (`backend/src/common/filters/all-exceptions.filter.ts`): los `429` los lanzan
guards (`ThrottlerGuard` global, `ReportExportThrottleGuard`) que corren antes del interceptor de
peticiones, así que el filtro es el único punto donde quedan registrados. La respuesta al cliente no
cambia.

| Campo | Contenido |
|---|---|
| `correlationId` | El de la petición |
| `method` | Método HTTP |
| `path` | Plantilla de la ruta (`/api/v1/customers/:id`), nunca la URL con identificadores ni la query |
| `clientIp` | IP del cliente según `TRUST_PROXY_HOPS` ([`environments.md`](../deployment/environments.md)) |
| `principalId` | Solo cuando el límite es por usuario (exportación de reportes, que se evalúa con la sesión ya autenticada). El límite global corre antes de la autenticación y no lo lleva |

No se registran cabeceras, cuerpo ni tokens. Es la base de la alerta de rechazos `429` en el SIEM
(plan, bloqueante 1.8).

**Sondas mínimas.** `GET /api/v1/health` responde solo `{ status: "ok", timestamp }` y
`GET /api/v1/ready` `{ status: "ready", timestamp }` o `503 SERVICE_NOT_READY` con el formato de
error único: ya no devuelven el nombre de la aplicación ni el detalle de la base de datos, porque son
públicas también desde internet ([`docs/api/README.md`](../api/README.md)).
