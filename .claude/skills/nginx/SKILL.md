---
name: nginx
description: Configura NGINX como reverse proxy del SPA y la API, con fallback SPA, cabeceras de seguridad, forwarded headers, límites, compresión y timeouts. Úsalo al tocar routing o configuración del borde.
---

# NGINX

## Purpose

Servir el SPA y enrutar la API desde un único origen, aplicando controles de borde
sin duplicar lógica de aplicación.

## When to use

Cambios de routing, cabeceras, límites de request, timeouts, compresión o TLS en el borde.

## Required context

ADR-011, `infrastructure/nginx/`, puertos de los servicios en `docker-compose.yml`.

## Inputs

Rutas a exponer, orígenes permitidos, tamaños máximos, tiempos esperados de respuesta.

## Standards

```text
/       → SPA estático, con fallback a index.html
/api/   → backend NestJS
```

- Forwarded headers: `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `Host`.
- Cabeceras de seguridad: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, CSP; `HSTS` cuando hay TLS.
- `server_tokens off`.
- Límite de tamaño de body y timeouts explícitos.
- Compresión para texto; **no** comprimir contenido ya comprimido.
- Cache largo con hash para assets; `no-cache` para `index.html`.
- El borde **no** decide autorización: eso es de la aplicación.

## Process

1. Define los `location` mínimos necesarios; evita regex costosas.
2. Configura `try_files $uri $uri/ /index.html` para el SPA.
3. Configura `proxy_pass` a la API con los forwarded headers correctos.
4. Ajusta `client_max_body_size` al caso real, no a un valor arbitrario grande.
5. Define `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout`.
6. Añade cabeceras de seguridad en un archivo incluible y reutilizable.
7. Configura caché de assets con hash y `no-cache` para el HTML de entrada.
8. Valida con `nginx -t` y prueba las rutas: SPA, ruta profunda, API, health.

## Required checks

- [ ] ¿Fallback SPA funcionando en rutas profundas?
- [ ] ¿`/api/` enrutado con forwarded headers completos?
- [ ] ¿Cabeceras de seguridad presentes?
- [ ] ¿`server_tokens off`?
- [ ] ¿Límite de body y timeouts explícitos?
- [ ] ¿Compresión activa para texto y desactivada para binarios comprimidos?
- [ ] ¿Caché correcta: assets con hash sí, `index.html` no?
- [ ] ¿`nginx -t` válido?

## Expected output

Configuración validada, rutas verificadas y documentación de los cambios de borde.

## Anti-patterns

- `client_max_body_size 0`
- `add_header` dentro de un `location` que anula silenciosamente las cabeceras heredadas
- Cachear `index.html` y dejar a los usuarios con una versión antigua del SPA
- Poner reglas de negocio o autorización en NGINX
- Exponer la versión del servidor
- CSP tan permisiva que no aporta nada (`default-src *`)

## Definition of Done

`nginx -t` válido, rutas verificadas end-to-end y cabeceras de seguridad comprobadas.

## Related Skills

`docker`, `security`, `observability`, `frontend-react`
