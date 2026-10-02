# infrastructure/docker

Container assets that are **not** part of an application build context.

| Location | Purpose |
|---|---|
| `backend/Dockerfile` | Backend image. Build context is the repository root. |
| `frontend/Dockerfile` | Frontend image (build + NGINX static server). Build context is the repository root. |
| `frontend/nginx/static.conf` | Static server inside the frontend container. Not the edge proxy. |
| `infrastructure/nginx/` | Edge reverse proxy mounted into the `nginx` service. |
| `docker-compose.yml` | Local orchestration: postgres, backend, frontend, nginx. |

## Why the build context is the repository root

This is a pnpm workspace. The lockfile, `pnpm-workspace.yaml` and
`tsconfig.base.json` live at the root and are required for a reproducible,
type-checked build. A per-application context cannot reach them.

## What belongs here

Compose overrides for specific scenarios (for example
`docker-compose.override.yml` for a development profile), database
initialisation scripts, and any image that is not one of the two applications.

Nothing in this folder may contain secrets. Values come from environment
variables or from the platform secret store (see SECURITY.md).
