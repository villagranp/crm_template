# Plan de exposición a internet · Mi Cliente AG

| Dato | Valor |
|---|---|
| Fecha | 2026-10-20 |
| Estado | **Borrador para revisión del área de Ciberseguridad** |
| Relación | Complementa el informe [`informe-ciberseguridad-2026-10`](informe-ciberseguridad-2026-10.pdf) y la verificación técnica [`asvs-5.0-L2-2026-10.md`](asvs-5.0-L2-2026-10.md). Los identificadores `G-xx` y `RA-x` son los de esa verificación |
| Clasificación | Uso interno · Confidencial |

## Contexto

El diseño actual asume una red interna: el entorno de QA corre en un Windows Server con certificado
autofirmado (ADR-026) y casi todo es local. Exponer la plataforma a internet cambia las prioridades:
cualquiera puede intentar autenticarse, enviar peticiones, subir archivos o saturar el servicio. Este
plan ordena las mitigaciones por **cuándo** deben estar resueltas.

**Regla de salida a internet:** la apertura queda condicionada a que la sección 1 esté completa y a
una prueba de penetración externa sobre el entorno de producción ya montado.

## 1. Bloqueantes: antes de abrir a internet

| # | Mitigación | Por qué en internet | Brecha | Responsable sugerido | Estado |
|---|---|---|---|---|---|
| 1.1 | **Solo SSO con Entra ID y MFA**: `AUTH_PROVIDER=entra`, credenciales locales revocadas (`auth:revoke-local`), MFA por Acceso Condicional; una única cuenta de emergencia documentada y vigilada | Con el acceso local expuesto, cualquiera puede probar contraseñas robadas de otros sitios (*credential stuffing*); la contraseña inicial compartida sería una puerta abierta | G-01, G-03 | Arquitectura · Seguridad · Administración del tenant | Desarrollado (ADR-027, rama `feature/sso-entra`); pendiente de despliegue y prueba real |
| 1.2 | **Configuración del tenant**: asignación de usuarios requerida, consentimiento de usuario desactivado, tokens v2, alertas de invitados y de altas masivas | Sin asignación requerida, cualquier cuenta del tenant puede provocar altas automáticas | — | Administración del tenant · Seguridad | Solicitado (`AUTHENTICATION.md` §4.3) |
| 1.3 | **TLS de verdad**: dominio propio, certificado de CA pública, **HSTS activo** y solo TLS 1.2/1.3 verificado con una herramienta de análisis | Sin HSTS y con un certificado no confiable, la conexión se puede interceptar o degradar | G-02 | DevOps · Seguridad | Pendiente (HSTS preparado por el `map` `$hsts_header`, apagado hasta producción, ajuste 2.12) |
| 1.4 | **WAF y protección DDoS delante** (p. ej. Azure Front Door o Application Gateway con WAF); exponer solo 443; base de datos, RDP/SSH y la API directa nunca a internet; `TRUST_PROXY_HOPS` ajustado al número real de proxies | El límite de peticiones es en memoria y por IP: no frena un ataque distribuido; detrás de proxies hay que conocer la IP real del cliente | G-15, G-26 | DevOps · Seguridad | Pendiente (`TRUST_PROXY_HOPS` y el `geo` de ingress de confianza ya existen, ajustes 2.4 y 2.11; faltan el WAF y fijar el valor real) |
| 1.5 | **Dependencias parcheadas y compuerta en el pipeline** (falla en alta o crítica) con plazos de remediación | Lo expuesto en internet se explota en días tras publicarse una vulnerabilidad | G-04 | DevOps · Backend · Frontend | Pendiente |
| 1.6 | **Antivirus para adjuntos**, con cuarentena y registro (requiere ADR) | Cualquier cuenta podría distribuir archivos maliciosos al resto del equipo | G-08 | Backend · DevOps · Arquitectura | Pendiente |
| 1.7 | **Secretos en bóveda** (Key Vault), roles de base de datos separados y la aplicación nunca propietaria de la bitácora | Un servidor comprometido no debe entregar todas las claves | G-12, RA-1 | DevOps · Seguridad | Pendiente |
| 1.8 | **Registros en el SIEM con alertas**: intentos fallidos, rechazos 429 (`rate_limited`), altas automáticas en ráfaga (`sso_user_provisioned`), errores 5xx | Sin visibilidad, un ataque se descubre tarde o nunca | G-09 | DevOps · Seguridad | Pendiente (los eventos ya se emiten, `rate_limited` incluido desde el ajuste 2.3; falta el envío y las alertas) |
| 1.9 | **Respaldos cifrados, fuera del servidor y con restauración probada** | Es lo que salva el negocio ante un ransomware | G-10 | DevOps | Pendiente |
| 1.10 | **Prueba de penetración externa** sobre producción ya montada | Una autoverificación no ve lo que ve un atacante | — | Seguridad | Pendiente |

## 2. Ajustes de código y configuración (rápidos)

Implementados en la rama `feature/endurecimiento-internet` (2026-10-20). Las pruebas unitarias y e2e
cubren el backend y el cliente HTTP; la CSP con nonce se verificó en Chromium (0 violaciones; control
negativo sin nonce: 24). No había NGINX ni Docker en el equipo de desarrollo, así que lo que depende del
borde o de las imágenes queda **pendiente de verificar en el entorno real** (abajo).

| # | Ajuste | Brecha | Estado |
|---|---|---|---|
| 2.1 | **Cookie de refresco con prefijo**: `__Secure-refresh_token` cuando `NODE_ENV` ≠ `development` (en desarrollo `refresh_token`, sin `Secure`); solo se lee el nombre vigente. No se usa `__Host-` porque exige `Path=/` y la cookie lleva `Path=/api/v1/auth`, así que V3.3.3 sigue sin cumplirse **por diseño** (`AUTHENTICATION.md` §3) | G-18 | Hecho |
| 2.2 | **Cabecera anti-CSRF**: `POST /auth/refresh` y `POST /auth/logout` exigen `X-Requested-With: XMLHttpRequest` (valor exacto); si no, `403 CSRF_HEADER_REQUIRED` sin efectos. El login no la exige; en modo `entra` esos endpoints siguen en `404`. El cliente HTTP del frontend la envía en todas las peticiones a la API. Cambio de contrato: el logout deja de ser «siempre 204» | G-20 | Hecho |
| 2.3 | **Registro de los 429**: evento `rate_limited` (`warn`) con `correlationId`, `method`, `path` (plantilla de ruta), `clientIp` y `principalId` solo en el límite por usuario; la respuesta no cambia (ADR-016, addendum 2026-10-20) | G-26 | Parcial: registro hecho; almacén compartido entre instancias y límite por cuenta, pendientes |
| 2.4 | **Proxies de confianza configurables**: `TRUST_PROXY_HOPS` (entero ≥ 0, por defecto 1; 2 con WAF/Front Door delante de NGINX; nunca más que los saltos reales) | G-26 (apoya 1.4) | Hecho |
| 2.5 | **CORS de producción estricto**: con `NODE_ENV=production`, `CORS_ALLOWED_ORIGINS` solo admite orígenes `https://` exactos (sin `*`, ruta ni barra final) o vacío (mismo origen); si no, la API no arranca. En `docker-compose.yml` es vacío por defecto | — | Hecho |
| 2.6 | **Sondas mínimas**: `/api/v1/health` → `{status:"ok", timestamp}`; `/api/v1/ready` → `{status:"ready", timestamp}` o `503 SERVICE_NOT_READY`. Se quitaron el nombre de la aplicación y el detalle de la base | — (anexo D) | Hecho |
| 2.7 | **Sin mapas de código fuente en producción** (`FRONTEND_BUILD_SOURCEMAP=hidden` opcional para una herramienta de monitorización) y `404` a `*.map` en NGINX | G-17 | Hecho en código, pendiente de verificar en el entorno real |
| 2.8 | **CSP con nonce por respuesta** en lugar de `style-src 'unsafe-inline'`, y `base-uri 'none'`. NGINX sustituye `__CSP_NONCE__` en `index.html` (`sub_filter`) y lo sirve sin caché; la caché de Emotion aplica el nonce; el contenedor del frontend no emite CSP (ADR-011, addendum 2026-10-20) | G-11 | Hecho en código, pendiente de verificar en el entorno real |
| 2.9 | **Cabeceras de seguridad en una sola capa**: en `/api/` NGINX oculta las de helmet que ya pone él | G-21 | Hecho en código, pendiente de verificar en el entorno real |
| 2.10 | **Métodos HTTP permitidos** en el borde (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`; el contenedor estático solo `GET` y `HEAD`); el resto, `405` | G-25 | Hecho en código, pendiente de verificar en el entorno real |
| 2.11 | **`X-Forwarded-Proto` del cliente ya no se confía**, salvo desde un `geo $from_trusted_ingress` (vacío y comentado, para cuando haya WAF/Front Door) | G-25 | Hecho en código, pendiente de verificar en el entorno real |
| 2.12 | **HSTS preparado por `map`** (`$hsts_header`): vacío (apagado) en Docker y QA; la línea de un año queda comentada para producción, que requiere dominio y certificado de CA pública (bloqueante 1.3) | G-02 | Parcial: preparado; se activa en producción |
| 2.13 | **Dockerfiles reproducibles**: sin el respaldo `pnpm install` sin lockfile e imágenes base fijadas por digest (`node:22.20.0-alpine`, `nginx:1.27-alpine`); el procedimiento para actualizarlos está comentado en los Dockerfile y en [`environments.md`](../deployment/environments.md#imágenes-base-fijadas-por-digest) | G-22 | Hecho en código, pendiente de verificar en el entorno real |

**Estado por brecha tras esta rama:** G-11, G-17, G-18, G-20, G-21 y G-22 resueltas en código
(pendientes de re-verificar en la próxima verificación ASVS y, las del borde, en el entorno real);
G-25 parcial; G-26 parcial (registro hecho; almacén compartido y límite por cuenta pendientes). V3.3.3
sigue sin cumplirse por diseño (ruta restringida de la cookie).

**Pendientes que quedaron fuera de esta rama:**

- La redirección HTTP→HTTPS de QA (puerto 8080) también redirige `/api`: debería redirigir solo la
  interfaz y responder error en `/api` (parte de G-25). Junto con el dominio propio de QA, la prueba de
  contrabando de peticiones y la revisión del `.git` en el servidor, mantienen G-25 como parcial.
- Actualizar `nginx:1.27` (etiqueta y digest) a la versión estable actual.

### Verificación pendiente en el entorno real

Con el NGINX y las imágenes reales (QA o producción), sustituyendo `<host>`. La lista completa y el
resultado esperado de cada una están en
[`environments.md`](../deployment/environments.md#comprobaciones-tras-actualizar-el-borde).

```bash
nginx -t                                              # sintaxis correcta
curl -skI https://<host>/                             # una sola cabecera de cada; CSP con 'nonce-…'
curl -sk  https://<host>/ | grep csp-nonce            # mismo nonce que la cabecera CSP de esa respuesta
curl -skI https://<host>/api/v1/health                # sin cabeceras duplicadas de helmet
curl -sk -X TRACE https://<host>/                     # 405
curl -sk -o /dev/null -w '%{http_code}' https://<host>/assets/x.js.map   # 404
docker compose build                                  # imágenes por digest, sin salir del lockfile
```

### Efectos de despliegue

- **Backend y frontend se despliegan juntos**: el backend exige la cabecera que solo envía el frontend
  nuevo; con un frontend anterior la sesión no se renueva.
- **Las sesiones locales vigentes se pierden una vez** al cambiar el nombre de la cookie; los usuarios
  vuelven a entrar.
- **`CORS_ALLOWED_ORIGINS` válido en producción** (`https://` exacto o vacío) o la API no arranca.
- **`TRUST_PROXY_HOPS=2`** si se pone un WAF o Front Door delante de NGINX, declarando además sus rangos
  en el `geo $from_trusted_ingress`.
- **Actualizar los digests** junto con la etiqueta en cada cambio de versión de una imagen base.

## 3. Primeros 30 días en producción

| # | Mitigación | Brecha |
|---|---|---|
| 3.1 | Cierre de sesión por inactividad, gestión de sesiones y revocación inmediata (con Entra ID, parte se delega en su política de sesión) | G-05, G-06 |
| 3.2 | TLS hacia PostgreSQL (`sslmode=verify-full`) y red aislada entre proxy y API | G-14 |
| 3.3 | Política de rotación de claves y certificados, con identificador de clave para rotar sin corte | G-27 |
| 3.4 | Modelo de amenazas, clasificación de datos y plan de respuesta a incidentes | G-10, G-28 |
| 3.5 | Reglas de salida de red y sincronización horaria verificadas | G-15 |

## 4. Decisiones no técnicas

- **Dónde corre producción.** El Windows Server de QA (ADR-026) se diseñó solo para QA. Para internet
  se recomienda una plataforma gestionada en Azure detrás de Front Door con WAF. Requiere su propio ADR.
- **Datos personales.** El CRM guarda datos de contactos de clientes: revisar con legal y cumplimiento
  la normativa aplicable antes de exponerlo.
