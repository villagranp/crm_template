# SECURITY.md

Security by design. Todo cambio pasa por el Skill [`security`](.claude/skills/security/SKILL.md).

---

## 1. Controles base del template

| Control | Implementación |
|---|---|
| Autenticación | JWT local o Entra ID (OAuth2/OIDC) — ver `AUTHENTICATION.md` |
| Autorización | RBAC + permisos `resource.action`, `PermissionsGuard` global |
| Validación de entrada | `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Cabeceras | Una sola capa: NGINX (`infrastructure/nginx/conf.d/security-headers.conf`). En `/api/` oculta las que helmet también pone (`proxy_hide_header`), así que cada respuesta lleva una cabecera de cada tipo |
| CSP | Con nonce por respuesta: `style-src 'self' 'nonce-…'` en lugar de `'unsafe-inline'`, `script-src 'self'`, `base-uri 'none'`, `object-src 'none'`, `frame-ancestors 'none'`. NGINX escribe el nonce en `index.html` y la caché de Emotion lo aplica (ADR-011, addendum 2026-10-20) |
| Cookie de sesión | `__Secure-refresh_token` (`refresh_token` solo en desarrollo), `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth` — ver `AUTHENTICATION.md` §3 |
| CSRF | `POST /auth/refresh` y `POST /auth/logout` (autenticados solo por cookie) exigen `X-Requested-With: XMLHttpRequest`; si falta, `403 CSRF_HEADER_REQUIRED` sin efectos. El resto exige `Authorization`, que ya dispara el preflight de CORS |
| Métodos HTTP | NGINX solo admite `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` y `OPTIONS` (el contenedor estático, solo `GET` y `HEAD`); el resto recibe `405` sin llegar a la API |
| Código del cliente | Sin mapas de código fuente en el build de producción; NGINX responde `404` a `*.map` |
| CORS | Allowlist explícita por entorno, sin `*` con credenciales. Con `NODE_ENV=production` solo orígenes `https://` exactos o ninguno (mismo origen): si no, la API no arranca |
| Rate limiting | `@nestjs/throttler` global + límites en NGINX. Cada `429` se registra (`rate_limited`). La IP del cliente sale de `TRUST_PROXY_HOPS` saltos de proxy de confianza |
| Secretos | Solo variables de entorno (en producción, se prevé Key Vault o variable groups: **no verificable desde el repositorio**, ver informe ASVS G-12). Nunca en Git |
| Logging | Estructurado, con correlation ID, sin datos sensibles |
| Dependencias | Actualizaciones revisadas. `pnpm audit` se ejecuta bajo demanda: la plantilla `security-scan.yml` **aún no está incluida en ningún pipeline** (informe ASVS G-04) |
| Errores | Formato único, sin stack traces ni detalles internos |
| Transporte | HTTPS obligatorio fuera de desarrollo local. HSTS lo decide solo NGINX con el `map` `$hsts_header`: vacío (no se envía) en Docker y QA; se activa solo en producción con dominio propio y certificado de CA pública (informe ASVS G-02). NGINX no confía en el `X-Forwarded-Proto` del cliente |

## 2. Modelo de confianza

Todo lo externo al proceso es **no confiable**: body, query, params, headers, cookies,
archivos subidos, respuestas de APIs externas, contenido almacenado y variables de entorno.

Se valida: forma, tipo, rango, longitud, formato y pertenencia a whitelist.

## 3. OWASP Top 10 — cómo lo aborda el template

| Riesgo | Mitigación |
|---|---|
| Broken Access Control | Guard global deny-by-default; permiso explícito por endpoint; verificación de propiedad del recurso (IDOR); tests de 401/403 obligatorios |
| Cryptographic Failures | Argon2id para passwords; TLS en tránsito; sin cifrado casero; secretos fuera del código |
| Injection | Prisma parametrizado; prohibido SQL por concatenación; `sortBy`/`fields` por whitelist; sanitización de salida en el frontend |
| Insecure Design | Flujo obligatorio con Architecture y Security Review antes de implementar; ADR para decisiones estructurales |
| Security Misconfiguration | Config validada al arranque (fail fast, incluido CORS solo `https://` en producción); cabeceras de seguridad en una sola capa; CSP con nonce; sin mapas de código fuente; métodos HTTP limitados en el borde; sondas de salud sin datos del sistema; Swagger deshabilitable por entorno; imágenes mínimas y usuario no root |
| Vulnerable Components | Revisión de licencia y mantenimiento antes de agregar dependencias; `pnpm audit` bajo demanda (pendiente integrarlo al pipeline, informe ASVS G-04) |
| Authentication Failures | Tokens de vida corta, rotación y revocación de refresh, cookie con prefijo `__Secure-`, cabecera anti-CSRF en refresh y logout, validación completa de firma/iss/aud/exp/nbf, rate limit en login |
| Integrity Failures | Lockfile versionado; `--frozen-lockfile` en CI y en los Dockerfile (sin respaldo sin lockfile); imágenes base fijadas por digest (`docs/deployment/environments.md`) |
| Logging Failures | Log estructurado de eventos de seguridad (login fallido, 403, cambios de permisos, `429` como `rate_limited`) sin exponer datos sensibles |
| SSRF | Sin fetch a URLs suministradas por el usuario; allowlist de destinos en integraciones |

Verificación detallada de estos controles contra OWASP ASVS 5.0 nivel 2 (autoverificación interna, sin prueba de penetración externa; no es una certificación): [`docs/security/asvs-5.0-L2-2026-10.md`](docs/security/asvs-5.0-L2-2026-10.md).

Qué falta para exponer la plataforma a internet (bloqueantes, ajustes ya hechos y su verificación pendiente en el entorno real): [`docs/security/plan-exposicion-internet.md`](docs/security/plan-exposicion-internet.md).

## 4. Gestión de secretos

- `.env` está en `.gitignore`. Solo se versiona `.env.example`.
- Producción y ambientes compartidos: Azure Key Vault o variable groups seguros de Azure DevOps (previsto; no verificable desde el repositorio, informe ASVS G-12 y anexo D).
- Prohibido: client secrets, certificados, llaves privadas o connection strings en el repositorio.
- Rotación: si un secreto se expone, se **rota**, no se borra el commit y ya.

## 5. Datos sensibles

- No se registran ni se devuelven datos personales innecesarios.
- Minimización: se solicita y almacena lo mínimo requerido por el caso de uso.
- Los campos sensibles se marcan en el modelo y se excluyen de los DTO de respuesta por defecto.
- Los payloads en logs se redactan con lista de campos prohibidos.

## 6. Requisitos por tipo de cambio

| Cambio | Revisión obligatoria |
|---|---|
| Nuevo endpoint | Auth, permiso, validación, errores, rate limit, tests 401/403 |
| Nuevo campo persistido | ¿Es sensible? ¿Se expone? ¿Se registra en log? ¿Migración segura? |
| Nueva dependencia | Mantenimiento, CVEs, licencia, tamaño, alternativa en el stack actual |
| Nueva integración externa | Autenticación M2M, allowlist de destino, timeouts, manejo de fallos |
| Cambio de configuración | ¿Se valida al arranque? ¿Tiene default inseguro? |

## 7. Reporte de vulnerabilidades

Los hallazgos no se publican en issues abiertos. Se reportan por el canal interno definido por
el equipo de seguridad de la organización y se registran, ya mitigados, en `CHANGELOG.md`
con prefijo `security:`.
