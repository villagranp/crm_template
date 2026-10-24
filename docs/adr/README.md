# Architecture Decision Records

Registro de decisiones estructurales. Un ADR aceptado no se edita para cambiar de opinión:
se crea uno nuevo que lo supersede.

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](ADR-001-react-vite.md) | React + TypeScript + Vite | Accepted |
| [ADR-002](ADR-002-nestjs.md) | NestJS como framework de backend | Accepted |
| [ADR-003](ADR-003-postgresql-prisma.md) | PostgreSQL + Prisma como stack transaccional | Accepted |
| [ADR-004](ADR-004-data-access-abstraction.md) | Abstracción de acceso a datos (Ports & Adapters) | Accepted |
| [ADR-005](ADR-005-rest-api-standard.md) | Estándar REST y contrato de API | Accepted |
| [ADR-006](ADR-006-authentication-architecture.md) | Arquitectura de autenticación extensible | Accepted |
| [ADR-007](ADR-007-entra-id.md) | Microsoft Entra ID vía OAuth 2.0 / OIDC | Accepted (addendum 2026-10-15: de identidad a cuenta local, ADR-027) |
| [ADR-008](ADR-008-authorization.md) | RBAC + autorización basada en permisos | Accepted (addendum 2026-10-10: `@RequireAnyPermission`) |
| [ADR-009](ADR-009-material-ui.md) | Material UI como librería de UI | Accepted |
| [ADR-010](ADR-010-docker.md) | Docker y Docker Compose | Accepted |
| [ADR-011](ADR-011-nginx.md) | NGINX como reverse proxy | Accepted |
| [ADR-012](ADR-012-azure-devops.md) | Azure DevOps como CI/CD | Accepted |
| [ADR-013](ADR-013-testing-strategy.md) | Estrategia y herramientas de pruebas | Accepted |
| [ADR-014](ADR-014-modular-clean-architecture.md) | Clean Architecture progresiva | Accepted |
| [ADR-015](ADR-015-snowflake-analytical-source.md) | Snowflake como fuente analítica | Accepted |
| [ADR-016](ADR-016-observability-correlation-id.md) | Observabilidad y correlation ID | Accepted |
| [ADR-017](ADR-017-design-system-grupo-ag.md) | Sistema de diseño Grupo AG sobre Material UI | Accepted |
| [ADR-018](ADR-018-identity-access-model.md) | Modelo de identidad, acceso y opciones de menú | Accepted (addendum 2026-10-10: `TERRITORY` → `COUNTRY`) |
| [ADR-019](ADR-019-autenticacion-local-con-migracion-a-entra.md) | Autenticación local inicial con migración posterior a Entra ID | Accepted (addendum 2026-10-15: corte directo, sin `hybrid`, ADR-027) |
| [ADR-020](ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md) | La asignación de accesos es exclusiva del administrador | Accepted (addenda 2026-10-10: equipos y país del usuario; 2026-10-15: alta automática sin acceso, ADR-027) |
| [ADR-021](ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md) | Almacenamiento de adjuntos en un sistema de archivos montado | Accepted |
| [ADR-022](ADR-022-exceljs-para-generar-y-leer-xlsx.md) | `exceljs` para generar y leer archivos XLSX | Accepted |
| [ADR-023](ADR-023-mui-x-charts-community-para-graficas.md) | `@mui/x-charts` (edición Community) para gráficas | Accepted |
| [ADR-024](ADR-024-moneda-base-usd-y-tipos-de-cambio.md) | Moneda base USD y tipos de cambio por país | Accepted |
| [ADR-025](ADR-025-inmutabilidad-de-la-auditoria-con-disparadores.md) | Inmutabilidad de la bitácora de auditoría con disparadores en la base | Accepted |
| [ADR-026](ADR-026-runtime-de-qa-en-windows-server-nativo.md) | Runtime de QA: Windows Server nativo con NGINX y servicios de Windows | Accepted |
| [ADR-027](ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md) | SSO con Entra ID: alta al primer ingreso sin permisos, vinculación por `oid` y corte directo | Accepted |
| [ADR-028](ADR-028-paises-solo-clientes-y-lista-de-correos-en-la-carga.md) | Países «solo clientes» y lista de correos en la carga de clientes | Accepted |
| [ADR-029](ADR-029-telefono-invalido-es-advertencia-en-la-carga.md) | Teléfono con formato inválido: advertencia, no error, en la carga de clientes | Accepted |
| [ADR-030](ADR-030-carga-masiva-de-usuarios-y-equipos-por-canal.md) | Carga masiva de usuarios por script y equipos por canal en la semilla | Accepted |
| [ADR-031](ADR-031-carga-de-proyectos-con-historial-comercial.md) | Carga de proyectos con historial comercial y catálogos del negocio | Accepted |

Los **addenda** se añaden al final del ADR que precisan, con fecha y estado propios,
cuando la decisión lo amplía sin contradecirlo; si lo contradice, se crea un ADR nuevo
que lo supersede.

Plantilla: [`TEMPLATE.md`](TEMPLATE.md).
