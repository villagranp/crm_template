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
