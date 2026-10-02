# ADR-010 - Docker y Docker Compose

## Status
Accepted — 2026-09-22

## Context
Se requiere que el entorno de desarrollo, el de CI y el de despliegue sean equivalentes, y que
levantar el stack completo no dependa de instalaciones manuales en cada máquina.

## Decision
Dockerfiles multi-stage para frontend y backend (`deps` → `build` → `production`), con imágenes
base pinneadas, usuario no root y healthchecks. `docker-compose.yml` levanta frontend, backend,
PostgreSQL y NGINX para desarrollo y validación local.

## Alternatives
- **Solo ejecución local con Node**: rápido, pero divergente respecto a producción y dependiente
  del entorno de cada desarrollador.
- **Dev containers**: buena experiencia de desarrollo; no resuelve el empaquetado de despliegue
  y añade otra capa que mantener. Compatible como complemento futuro.

## Consequences
- Paridad entre entornos y builds reproducibles.
- Onboarding en minutos.
- Coste: tiempos de build y necesidad de mantener los Dockerfiles alineados con el stack.

## Security Considerations
Imágenes mínimas, usuario sin privilegios, sin secretos en capas ni en argumentos de build.
Los secretos se inyectan en runtime. Las imágenes se escanean en el pipeline antes de publicarse.
