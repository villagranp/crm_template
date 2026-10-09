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

- Administración completa (PLAN-ADMIN): usuarios, roles y permisos, opciones
  de menú, equipos, catálogos, parámetros, auditoría y bandeja de aprobaciones.
  Toda mutación queda en la bitácora con la diferencia antes/después.
- Exportación CSV de usuarios y de auditoría, con protección contra inyección
  de fórmulas y tope de 10 000 filas.
- Registro de rutas navegables (`app-routes.registry.json`) que valida las
  opciones de menú creadas desde la interfaz.

- Skills de pulido de UI y movimiento de emilkowalski/skills (10, MIT), con
  precedencia de las reglas del proyecto (CLAUDE.md §4).
- Skill `ui-ux-pro-max` (MIT) como consulta de recomendaciones de UX; sin
  generación de sistemas de diseño propios (ADR-017).

### Changed
- **Contrato:** `GET /roles` pasa a ser paginado (`{ data, pagination }`).
- **Contrato:** `PATCH /users/{id}` ya no acepta `status`; el estado cambia con
  `POST /users/{id}/suspend` y `/reactivate`, que cierran sesiones y aplican
  las salvaguardas.
- **Contrato:** los roles de sistema rechazan cambios con
  `409 SYSTEM_RESOURCE_READ_ONLY` (la semilla repone sus asignaciones).
- **Seguridad (ADR-020):** asignar roles y permisos, crear o duplicar roles,
  cambiar lo que concede un rol, restablecer contraseñas y actuar sobre un
  administrador exigen el rol
  `administrador` (`403 ADMIN_ONLY`). Un no administrador solo da de alta
  usuarios con roles sin permisos. `gestor-accesos` gana `equipos.crear` y
  `equipos.eliminar`.
- Salvaguardas de acceso: `SELF_LOCKOUT` y `LAST_ADMIN` también se aplican a
  las denegaciones directas, y la comprobación es atómica (bloqueo consultivo
  de PostgreSQL). Las jerarquías de equipos y de menú se modifican bajo
  bloqueo para que dos cambios simultáneos no creen un ciclo.
- `POST /users` con `teamIds` exige `equipos.editar` y valida los equipos
  (`422 UNKNOWN_REFERENCE`). Las asignaciones directas rechazan destinos
  repetidos y más de 200 elementos (`400`).
- Reactivar una cuenta bloqueada levanta también el bloqueo por intentos.
- `JWT_REFRESH_TOKEN_TTL` por defecto pasa de `7d` a `8h`, sin deslizamiento.
- Las variables de duración (`JWT_*_TTL`) se validan al arrancar.

### Fixed
- La API confía en un salto de proxy y NGINX sobrescribe `X-Forwarded-For`:
  detrás de NGINX el rate limiting trataba a todos los usuarios como una sola
  IP, y la cabecera del cliente se propagaba sin filtrar.
- `VITE_API_BASE_URL` de ejemplo pasa a `/api/v1`: una URL absoluta a otro
  origen impedía enviar la cookie de refresco en el stack de Docker.