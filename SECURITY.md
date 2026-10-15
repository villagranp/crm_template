# SECURITY.md

Security by design. Todo cambio pasa por el Skill [`security`](.claude/skills/security/SKILL.md).

---

## 1. Controles base del template

| Control | Implementación |
|---|---|
| Autenticación | JWT local o Entra ID (OAuth2/OIDC) — ver `AUTHENTICATION.md` |
| Autorización | RBAC + permisos `resource.action`, `PermissionsGuard` global |
| Validación de entrada | `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Cabeceras | Helmet en la API + cabeceras de seguridad en NGINX |
| CORS | Allowlist explícita por entorno, sin `*` con credenciales |
| Rate limiting | `@nestjs/throttler` global + límites en NGINX |
| Secretos | Solo variables de entorno (en producción, se prevé Key Vault o variable groups: **no verificable desde el repositorio**, ver informe ASVS G-12). Nunca en Git |
| Logging | Estructurado, con correlation ID, sin datos sensibles |
| Dependencias | Actualizaciones revisadas. `pnpm audit` se ejecuta bajo demanda: la plantilla `security-scan.yml` **aún no está incluida en ningún pipeline** (informe ASVS G-04) |
| Errores | Formato único, sin stack traces ni detalles internos |
| Transporte | HTTPS obligatorio fuera de desarrollo local. La API emite HSTS (helmet); en NGINX el HSTS está **comentado** hasta tener un certificado público (informe ASVS G-02) |

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
| Security Misconfiguration | Config validada al arranque (fail fast); Helmet; CORS explícito; Swagger deshabilitable por entorno; imágenes mínimas y usuario no root |
| Vulnerable Components | Revisión de licencia y mantenimiento antes de agregar dependencias; `pnpm audit` bajo demanda (pendiente integrarlo al pipeline, informe ASVS G-04) |
| Authentication Failures | Tokens de vida corta, rotación y revocación de refresh, validación completa de firma/iss/aud/exp/nbf, rate limit en login |
| Integrity Failures | Lockfile versionado; `--frozen-lockfile` en CI; imágenes pinneadas por digest en release |
| Logging Failures | Log estructurado de eventos de seguridad (login fallido, 403, cambios de permisos) sin exponer datos sensibles |
| SSRF | Sin fetch a URLs suministradas por el usuario; allowlist de destinos en integraciones |

Verificación detallada de estos controles contra OWASP ASVS 5.0 nivel 2 (autoverificación interna, sin prueba de penetración externa; no es una certificación): [`docs/security/asvs-5.0-L2-2026-10.md`](docs/security/asvs-5.0-L2-2026-10.md).

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
