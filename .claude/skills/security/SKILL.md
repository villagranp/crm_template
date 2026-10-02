---
name: security
description: Revisión de seguridad aplicada a cada cambio: autenticación, autorización, inyección, datos sensibles, secretos, tokens, validación, logging, dependencias, rate limiting, CORS y cabeceras. Úsalo en todo cambio que toque entradas externas, datos o accesos.
---

# Security

## Purpose

Detectar y cerrar riesgos antes de que el cambio llegue a producción, con criterios concretos
en lugar de buenas intenciones.

## When to use

Todo cambio que reciba datos externos, exponga datos, mueva secretos, toque accesos,
agregue dependencias o modifique infraestructura.

## Required context

`SECURITY.md`, `AUTHENTICATION.md`, ADRs de seguridad, configuración vigente.

## Inputs

Diff del cambio, contrato de API, modelo de datos, dependencias nuevas.

## Standards — checklist OWASP aplicada

| Área | Qué se exige |
|---|---|
| Autenticación | Validación completa del token; tokens con TTL; rate limit en login |
| Autorización | Deny-by-default; permiso por endpoint; verificación de propiedad |
| Inyección | Consultas parametrizadas; `sortBy`/`fields` por whitelist; sin SQL concatenado |
| Datos sensibles | Mínimos necesarios; fuera de logs y de errores; marcados en el modelo |
| Secretos | Solo por configuración; nunca en Git ni en logs de build |
| Manejo de tokens | Sin tokens en logs, URLs ni `localStorage` sin justificación |
| Validación | Toda entrada externa validada; sin campos no declarados |
| Logging | Estructurado, con correlation ID, con redacción de campos sensibles |
| Dependencias | `pnpm audit` limpio en alto/crítico; licencia y mantenimiento revisados |
| Rate limiting | Global y reforzado en endpoints sensibles; `429` documentado |
| CORS | Allowlist explícita; sin `*` con credenciales |
| Cabeceras | Helmet en la API; cabeceras de seguridad en NGINX; HSTS fuera de local |
| SSRF | Sin peticiones a URLs suministradas por el usuario; allowlist de destinos |

## Process

1. Enumera las **entradas** del cambio: body, query, params, headers, archivos, respuestas externas.
2. Por cada entrada: ¿validada, acotada en tamaño y tipada?
3. Enumera las **salidas**: ¿se expone algo que no debería? ¿Errores sin detalles internos?
4. Revisa control de acceso: permiso, propiedad, alcance de listados.
5. Revisa manejo de secretos y configuración nueva.
6. Revisa logs: ¿algún campo sensible? ¿Se redacta?
7. Revisa dependencias nuevas: CVEs, mantenimiento, licencia, tamaño, alternativa existente.
8. Piensa como atacante: ¿qué haría con este endpoint? Enumeración, IDOR, abuso de volumen,
   escalada de privilegios, exfiltración por mensajes de error.
9. Escribe pruebas para los controles que agregaste.

## Required checks

- [ ] Sin secretos en el diff ni en el historial
- [ ] Toda entrada validada y acotada
- [ ] Autorización y propiedad verificadas
- [ ] Errores sin stack trace, SQL ni datos internos
- [ ] Logs sin PII, tokens ni payloads completos
- [ ] Consultas parametrizadas y con límite
- [ ] Dependencias auditadas
- [ ] Rate limit donde corresponde
- [ ] CORS y cabeceras correctos
- [ ] Pruebas de seguridad añadidas (401, 403, validación, límites)

## Expected output

Sección "Security impact" resuelta, hallazgos con severidad y mitigación, y pruebas
que verifican los controles.

## Anti-patterns

- "Es interno, no necesita validación."
- Confiar en la validación del frontend.
- Loggear el request completo "para depurar".
- Concatenar el `sortBy` recibido dentro de la consulta.
- Subir un `.env` real "solo esta vez".
- Silenciar una alerta de `pnpm audit` sin evaluarla.
- Mensajes de error que distinguen "usuario no existe" de "contraseña incorrecta".

## Definition of Done

Ningún hallazgo bloqueante abierto, controles probados y decisiones de riesgo documentadas.

## Related Skills

`authentication`, `authorization`, `entra-id`, `api-design`, `observability`, `testing`, `adr`
