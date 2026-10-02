---
name: observability
description: Logging estructurado, correlation ID, health y readiness, con compatibilidad futura hacia OpenTelemetry. Úsalo al añadir logs, endpoints de salud o instrumentación.
---

# Observability

## Purpose

Poder responder qué pasó, dónde y para qué request, sin exponer datos sensibles.

## When to use

Nuevos flujos, integraciones, manejo de errores, endpoints de salud o instrumentación.

## Required context

`infrastructure/logging/`, middleware de correlación, ADR-016.

## Inputs

Eventos relevantes del flujo, dependencias externas involucradas.

## Standards

- Log estructurado JSON, un evento por línea, con `correlationId`, `method`, `path`, `statusCode`,
  `durationMs` y contexto de negocio no sensible.
- Niveles: `error` (requiere acción), `warn` (anomalía tolerada), `info` (hito de negocio),
  `debug` (diagnóstico, fuera de producción).
- `X-Correlation-ID`: se preserva si llega y es seguro; si no, se genera. Se devuelve siempre
  en la respuesta y se incluye en los errores.
- `GET /api/v1/health` → liveness, sin dependencias externas.
- `GET /api/v1/ready` → readiness, verifica dependencias críticas (base de datos).
- Prohibido en logs: passwords, tokens, cookies, secretos, PII, payloads completos sin redactar.
- Diseño compatible con OpenTelemetry / Application Insights sin instalar todo por adelantado.

## Process

1. Identifica los eventos que un operador necesitaría para diagnosticar un fallo.
2. Añade logs en los bordes: entrada de request, llamada externa, error, decisión relevante.
3. Incluye siempre el `correlationId` del contexto; no lo pases a mano por cada función.
4. Propaga el correlation ID a llamadas salientes.
5. Define qué convierte a `ready` en fallido y con qué timeout.
6. Redacta campos sensibles con una lista explícita de claves prohibidas.
7. Loggea eventos de seguridad: login fallido, `403`, cambio de permisos, rate limit excedido.
8. Verifica el formato del log en local y que el correlation ID viaje end-to-end.

## Required checks

- [ ] ¿Logs estructurados con `correlationId`?
- [ ] ¿Nivel apropiado por evento?
- [ ] ¿Sin datos sensibles ni payloads completos?
- [ ] ¿Errores loggeados una sola vez, donde se manejan?
- [ ] ¿`health` sin dependencias y `ready` con ellas?
- [ ] ¿Correlation ID propagado a servicios externos?
- [ ] ¿Eventos de seguridad registrados?

## Expected output

Logs útiles y seguros, health/ready correctos y correlación verificable de punta a punta.

## Anti-patterns

- `console.log` en producción.
- Loggear el mismo error en cada capa que lo propaga.
- `health` que consulta la base de datos y provoca reinicios en cascada.
- Mensajes sin contexto: `"error"`, `"failed"`, `"ok"`.
- Loggear el body completo del request "para depurar".
- Generar un correlation ID nuevo en cada capa.

## Definition of Done

Cada request es rastreable por su correlation ID, los logs no exponen datos sensibles y
health/ready reflejan el estado real.

## Related Skills

`backend-nestjs`, `security`, `docker`, `nginx`, `azure-devops`
