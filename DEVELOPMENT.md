# DEVELOPMENT.md

Cómo levantar y trabajar en este template.

## 1. Requisitos

### Imprescindibles

| Herramienta | Versión | Por qué |
|---|---|---|
| Node.js | 22 LTS (ver `.nvmrc`) | Runtime de ambos workspaces. `engines` exige `>=22` |
| pnpm | 9.12.0 (`corepack enable`) | Gestor del monorepo. No se instala con `npm i -g pnpm`: viene con Node vía corepack |
| Docker + Compose v2 | reciente | PostgreSQL local, NGINX y las imágenes de despliegue |
| Git | 2.30+ | `.gitattributes` y firma de commits |

### Según lo que vayas a hacer

| Herramienta | Cuándo hace falta |
|---|---|
| Navegadores de Playwright | Antes del primer `pnpm test:e2e`: `pnpm --filter @app/frontend exec playwright install --with-deps chromium` |
| `psql` o un cliente SQL | Opcional: `prisma:studio` cubre la inspección diaria |
| Azure CLI | Opcional, sólo si creas repos o pipelines desde la terminal |

### Comprobación rápida

```bash
node -v      # v22.x
pnpm -v      # 9.12.0
docker -v && docker compose version
git --version
```

Si `pnpm` no existe: `corepack enable && corepack prepare pnpm@9.12.0 --activate`.

En Windows, trabaja dentro de **WSL2** (Ubuntu) con Docker Desktop apuntando a
WSL. Los scripts de `infrastructure/scripts/` son Bash y los contenedores son
Linux: fuera de WSL el entorno funciona a medias y falla de formas difíciles de
diagnosticar.

## 2. Primer arranque

```bash
corepack enable
pnpm install
cp .env.example .env                              # completar valores locales
docker compose up -d postgres                     # base de datos local
pnpm --filter @app/backend run prisma:generate
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed        # roles, permisos, opciones y admin
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs (solo si `SWAGGER_ENABLED=true`)
- Stack completo tras NGINX: `docker compose up -d` → http://localhost

## 3. Scripts del workspace

| Comando | Qué hace |
|---|---|
| `pnpm dev` | frontend + backend en watch |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | unit tests |
| `pnpm test:e2e` | E2E |
| `pnpm build` | build de producción |
| `pnpm verify` | lint + typecheck + test + build (lo mismo que el PR pipeline) |

## 4. Variables de entorno

Toda variable nueva se agrega a `.env.example` **y** al esquema de validación
(`backend/src/config/env.schema.ts` o `frontend/src/config/env.ts`).
La aplicación falla al arrancar si falta una variable obligatoria: eso es intencional.

En el frontend solo `VITE_*`, y solo valores públicos: el bundle es visible para cualquiera.

## 5. Base de datos

```bash
pnpm --filter @app/backend run prisma:migrate    # crear/aplicar migración en dev
pnpm --filter @app/backend run prisma:studio     # inspección
pnpm --filter @app/backend run prisma:generate   # regenerar cliente
pnpm --filter @app/backend run prisma:seed       # sembrar el núcleo de gestión (idempotente)
```

Ninguna tabla se crea a mano. Toda migración es reversible o documenta su irreversibilidad.

## 6. Flujo de trabajo diario

1. Toma el requerimiento → Skill `requirements-analysis`.
2. Escribe la user story en `docs/user-stories/` → Skill `user-story`.
3. Valida la Definition of Ready.
4. Crea el implementation plan en `docs/implementation-plans/`.
5. Implementa siguiendo `feature-development`.
6. `pnpm verify`.
7. Actualiza documentación y OpenAPI.
8. Abre el PR con la plantilla de `CONTRIBUTING.md`.

## 7. Problemas frecuentes

| Síntoma | Causa habitual |
|---|---|
| La API no arranca y menciona configuración | Falta una variable en `.env` (fail fast intencional) |
| `401` en todas las llamadas locales | `AUTH_PROVIDER` sin configurar o token expirado |
| CORS bloqueado | Origen no incluido en `CORS_ALLOWED_ORIGINS` |
| Prisma no encuentra el cliente | Falta `prisma:generate` tras cambiar el schema |
| Puerto ocupado | Otro stack corriendo: `docker compose down` |
