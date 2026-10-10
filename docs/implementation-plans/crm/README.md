# CRM comercial — especificaciones de implementación

Desarrollo incremental del CRM descrito en
[`docs/requirements/crm/ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md),
sobre la arquitectura existente del repositorio (CLAUDE.md, ADRs, skills). Nada
de esta carpeta redefine arquitectura, autenticación ni convenciones.

## Archivos

| Archivo | Contenido |
|---|---|
| [`00-modelo-de-datos.md`](00-modelo-de-datos.md) | Modelo relacional compartido por los 7 módulos, catálogos, visibilidad, permisos y plan de seeds. **Contrato** que siguen todas las especificaciones |
| [`01-inicio-dashboard.md`](01-inicio-dashboard.md) | Módulo 1 — Inicio / Dashboard |
| [`02-clientes-cuentas.md`](02-clientes-cuentas.md) | Módulo 2 — Clientes / Cuentas |
| [`03-proyectos.md`](03-proyectos.md) | Módulo 3 — Proyectos (núcleo comercial) |
| [`04-actividad-comercial.md`](04-actividad-comercial.md) | Módulo 4 — Actividad comercial |
| [`05-reportes.md`](05-reportes.md) | Módulo 5 — Reportes |
| [`06-integraciones.md`](06-integraciones.md) | Módulo 6 — Integraciones (carga masiva) |
| [`07-administracion.md`](07-administracion.md) | Módulo 7 — Administración |
| [`matriz-trazabilidad.md`](matriz-trazabilidad.md) | Las 47 funcionalidades y su estado |
| [`decisiones-pendientes.md`](decisiones-pendientes.md) | Decisiones de negocio y arquitectura abiertas |

Cada especificación sigue las secciones A–L del alcance (§10).

## Orden de implementación (alcance §11)

0. **Fase 0** — modelo Prisma y carga de maestros (transversal, no es un módulo).
1. Clientes / Cuentas.
2. Proyectos.
3. Actividad comercial.
4. Inicio / Dashboard.
5. Reportes.
6. Integraciones.
7. Administración y catálogos (las pantallas de mantenimiento van al final; sus
   tablas existen y se usan desde la Fase 0).

Cada módulo se implementa solo, se verifica (pruebas unitarias, de integración y
E2E del módulo) y se revisa antes de empezar el siguiente. Una funcionalidad no
pasa a `completada` en la matriz hasta estar implementada **y** validada.

## Relación con lo ya construido

La administración del núcleo (usuarios, roles, permisos, menú, equipos,
catálogos genéricos, parámetros, auditoría) ya existe (PLAN-ADMIN, ADR-020). El
Módulo 7 la **extiende** con lo que pide el alcance; no la duplica ni la sustituye.
