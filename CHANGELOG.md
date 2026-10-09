# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Proyecto creado a partir de project-template v1.0.1.
- Autenticación local (PLAN-AUTH-LOCAL): login, refresh con rotación y
  detección de reutilización, logout, cambio de contraseña, bloqueo por
  intentos fallidos, contraseñas iniciales con cambio obligatorio y
  restablecimiento por administrador.
- Pruebas de integración contra PostgreSQL en el esquema aislado `integration_test`.

### Changed
- `JWT_REFRESH_TOKEN_TTL` por defecto pasa de `7d` a `8h`, sin deslizamiento.
- Las variables de duración (`JWT_*_TTL`) se validan al arrancar.

### Fixed
- La API confía en un salto de proxy y NGINX sobrescribe `X-Forwarded-For`:
  detrás de NGINX el rate limiting trataba a todos los usuarios como una sola
  IP, y la cabecera del cliente se propagaba sin filtrar.
- `VITE_API_BASE_URL` de ejemplo pasa a `/api/v1`: una URL absoluta a otro
  origen impedía enviar la cookie de refresco en el stack de Docker.