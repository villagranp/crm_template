# Enterprise Project Template

Plantilla empresarial reutilizable para desarrollo asistido por IA (Vibe Coding controlado).
**No es una aplicación de negocio**: es el sistema de desarrollo sobre el que se construyen
aplicaciones de negocio.

```text
React + TypeScript + Vite + MUI   ⟷   NGINX   ⟷   NestJS + TypeScript + REST/OpenAPI
                                                   ⟷ PostgreSQL (Prisma) | Snowflake | APIs
```

## Qué incluye

| Bloque | Contenido |
|---|---|
| Gobernanza | `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md` |
| Estándares | `API-STANDARDS.md`, `CODING-STANDARDS.md` |
| Arquitectura | `ARCHITECTURE.md` + 18 ADR en `docs/adr/` |
| Seguridad | `SECURITY.md`, `AUTHENTICATION.md` |
| Testing | `TESTING.md` |
| Sistema de IA | 9 agentes y 25 skills en `.claude/` |
| Identidad visual | Sistema de diseño Grupo AG sobre MUI: `docs/design/`, `frontend/src/theme/` |
| Núcleo de gestión | Usuarios, roles, permisos, opciones de menú y asignaciones: `docs/database/data-model.md` |
| Skeleton | `frontend/`, `backend/` sin lógica de negocio |
| Infraestructura | Docker, Docker Compose, NGINX, Azure DevOps |

## Arranque rápido

```bash
corepack enable && pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm --filter @app/backend run prisma:generate
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed
pnpm dev
```

Detalle completo en [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Publicarlo como plantilla

Para dejarlo en Azure DevOps como repositorio del que nacen todos los proyectos,
sigue [`docs/deployment/template-repository.md`](docs/deployment/template-repository.md).

## Cómo usarlo para un proyecto nuevo

1. Copia o clona el template en el repositorio del proyecto.
2. Renombra el paquete raíz y actualiza `README.md` con el contexto del producto.
3. Decide `AUTH_PROVIDER` (`local` | `entra`) y registra la decisión como ADR del proyecto.
4. Ejecuta la semilla y entra con el administrador inicial; ajusta roles y opciones
   desde el módulo de Administración (Skill `access-management`).
5. Sustituye los activos de `frontend/public/brand/` y los tokens de
   `frontend/src/theme/tokens.ts` si el cliente es otro (Skill `design-system`).
6. Define el modelo de datos de negocio con el Skill `database`, no con Prisma directo.
7. Escribe la primera user story en `docs/user-stories/` y sigue
   [`.claude/skills/feature-development/SKILL.md`](.claude/skills/feature-development/SKILL.md).

**Regla:** la primera ejecución del template no crea funcionalidad de negocio.
Primero el sistema de desarrollo, después el producto.

## Para agentes de IA

Empieza por [`CLAUDE.md`](CLAUDE.md). Antes de modificar código de producción, determina
qué Skills aplican al cambio solicitado y síguelos.

## Reporte de la Foundation

Ver [`docs/FOUNDATION-REPORT.md`](docs/FOUNDATION-REPORT.md).
