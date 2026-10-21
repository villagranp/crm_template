# ADR-011 - NGINX como reverse proxy

## Status
Accepted — 2026-09-22

## Context
El SPA y la API deben servirse desde un mismo origen para simplificar CORS y cookies, y se
necesitan controles de borde (cabeceras de seguridad, límites, compresión, fallback SPA).

## Decision
NGINX como reverse proxy: `/` sirve el SPA con fallback a `index.html`, `/api/` enruta al backend
NestJS con forwarded headers. Cabeceras de seguridad, `server_tokens off`, límites de body,
timeouts explícitos, compresión para texto y caché diferenciada (assets con hash sí, `index.html` no).

## Alternatives
- **Traefik / Caddy**: configuración más moderna y TLS automático; menor familiaridad operativa
  y menor presencia en los entornos destino.
- **Servir el SPA desde NestJS**: un servicio menos, pero acopla el ciclo de vida del frontend al
  del backend y desperdicia la eficiencia de un servidor estático.

## Consequences
- Un solo origen: CORS simplificado y cookies `SameSite` viables.
- Punto único para aplicar controles de borde.
- Coste: un componente más en el stack local y en el despliegue.

## Security Considerations
NGINX aplica cabeceras de seguridad y límites de tamaño/tiempo, pero **no** decide autorización:
esa responsabilidad es exclusivamente de la aplicación. TLS y HSTS se configuran en el borde
de cada entorno real.

## Addendum 2026-10-20 — Endurecimiento del borde para exponer la plataforma a internet

La decisión (NGINX como reverse proxy de un solo origen) no cambia. Este addendum fija cómo aplica
el borde los controles de seguridad desde la rama `feature/endurecimiento-internet`
([plan de exposición a internet](../security/plan-exposicion-internet.md) §2, brechas ASVS G-11,
G-21 y G-25). Configuración: `infrastructure/nginx/nginx.conf`, `infrastructure/nginx/conf.d/`,
`infrastructure/qa-windows/nginx.conf` y `frontend/nginx/static.conf`.

### CSP con nonce por respuesta

MUI/Emotion inyecta `<style>` en tiempo de ejecución (ADR-009). En lugar de `style-src
'unsafe-inline'`, la CSP solo admite los `<style>` que llevan el nonce de la respuesta:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'nonce-$request_id'; img-src 'self' data:;
font-src 'self' data:; connect-src 'self' https://login.microsoftonline.com; frame-ancestors 'none';
base-uri 'none'; form-action 'self'; object-src 'none'
```

- El nonce es `$request_id` de NGINX (128 bits aleatorios, nuevo en cada petición).
- `frontend/index.html` lleva `<meta name="csp-nonce" content="__CSP_NONCE__">`. El borde sustituye
  el marcador por el mismo `$request_id` con `sub_filter` (solo `text/html`; hacia el contenedor del
  frontend se envía `Accept-Encoding: ""` porque `sub_filter` no actúa sobre cuerpos comprimidos).
- `frontend/src/theme/emotion-cache.ts` lee el meta y crea la caché de Emotion con ese nonce
  (`@emotion/cache`, ya parte de Emotion). Sin NGINX (Vite, pruebas) el marcador queda sin sustituir
  y la caché se crea sin nonce.
- **Toda `location` que sirva `index.html` debe sustituir el nonce y servirlo sin caché**
  (`no-store`): una página cacheada reutilizaría un nonce viejo y se quedaría sin estilos. En Docker
  lo resuelve el `map` `$frontend_cache_control` por tipo de contenido; en QA, `location =
  /index.html`. Los assets con hash conservan su caché.
- **El contenedor del frontend no emite CSP** (`frontend/nginx/static.conf`): dos políticas con
  nonces distintos bloquearían todos los estilos. La CSP la pone solo el borde.
- Verificado en Chromium contra el build servido con la política: 0 violaciones; control negativo
  sin nonce, 24 violaciones. Pendiente de verificar con el NGINX real (plan §2).

### Métodos permitidos

El borde responde `405` a todo método que no sea `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` u
`OPTIONS` (TRACE, CONNECT, verbos WebDAV…), sin llegar a la API. El contenedor estático solo admite
`GET` y `HEAD`.

### `X-Forwarded-Proto`

El `X-Forwarded-Proto` del cliente ya no se reenvía: la API recibe el `$scheme` del propio NGINX.
Solo las peticiones que llegan desde un ingress conocido (WAF, Front Door, Application Gateway) que
termina TLS y siempre sobrescribe la cabecera pueden pasarla; esos rangos se declaran en el `geo
$from_trusted_ingress` de `nginx.conf`, que está vacío a propósito. Con ese salto adicional la API
debe usar `TRUST_PROXY_HOPS=2` ([`environments.md`](../deployment/environments.md)).

### Cabeceras unificadas

`conf.d/security-headers.conf` es la única capa que fija las cabeceras de seguridad. En `/api/` el
borde oculta con `proxy_hide_header` las que helmet también pone (`X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, `Cross-Origin-*`,
`Permissions-Policy`, `Strict-Transport-Security`), así que cada respuesta lleva una de cada tipo.
Una `location` con `add_header` propio pierde las heredadas: vuelve a incluir
`security-headers.conf`.

### HSTS por `map`

`security-headers.conf` emite `Strict-Transport-Security $hsts_header`; NGINX no envía una cabecera
de valor vacío. Cada `http {}` define el `map` `$hsts_header`: vacío (apagado) en Docker y en QA
(certificado autofirmado o interno y dirección compartida con otra aplicación), con la línea de un
año (`max-age=31536000; includeSubDomains`) comentada en `infrastructure/nginx/nginx.conf` para
producción. Se activa solo con dominio propio y certificado de CA pública; `preload` es una decisión
aparte.

### Consecuencias

- Al añadir una `location` que sirva HTML hay que replicar el `sub_filter` y el `no-store`.
- Al añadir un ingress delante de NGINX hay que declarar sus rangos en el `geo`, ajustar
  `TRUST_PROXY_HOPS` y revisar `X-Forwarded-For` (añadir en lugar de sobrescribir).
- Las comprobaciones con `nginx -t` y `curl` tras cada cambio están en
  [`environments.md`](../deployment/environments.md).
