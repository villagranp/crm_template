---
name: docker
description: Construye imágenes y stacks reproducibles, mínimos y sin secretos, con multi-stage, usuario no root y healthchecks. Úsalo al tocar Dockerfiles, docker-compose o el runtime de contenedores.
---

# Docker

## Purpose

Que la aplicación se construya y ejecute igual en cualquier entorno, con imágenes pequeñas
y seguras.

## When to use

Cambios en `frontend/Dockerfile`, `backend/Dockerfile`, `docker-compose.yml` o el arranque
de los contenedores.

## Required context

ADR-010, Dockerfiles actuales, `.env.example`, configuración de NGINX.

## Inputs

Dependencias del runtime, variables requeridas, puertos, healthchecks.

## Standards

- Multi-stage: `deps` → `build` → `production`.
- Imagen base pinneada (`node:22-alpine`, `nginx:1.27-alpine`); en release, por digest.
- Usuario **no root** en la etapa final.
- `.dockerignore` que excluya `node_modules`, `.env`, `.git`, pruebas y artefactos.
- Sin secretos en `ARG`, `ENV`, capas ni logs de build. Los secretos entran en runtime.
- Healthcheck apuntando a `/api/v1/health`.
- `pnpm install --frozen-lockfile` para builds reproducibles.
- Orden de capas por estabilidad: manifiestos primero, código después.

## Process

1. Copia manifiestos (`package.json`, `pnpm-lock.yaml`) e instala dependencias en su propia capa.
2. Copia el código y construye en la etapa `build`.
3. En `production`, copia solo el artefacto y las dependencias de producción.
4. Crea y usa un usuario sin privilegios; fija `WORKDIR` y permisos.
5. Define `EXPOSE`, `HEALTHCHECK` y el comando de arranque.
6. Verifica el tamaño final y que no queden herramientas de build.
7. Comprueba que ningún secreto quedó en la imagen (`docker history`).
8. Valida el stack: `docker compose config` y luego `docker compose up`.

## Required checks

- [ ] Multi-stage y base pinneada
- [ ] Usuario no root en la imagen final
- [ ] `.dockerignore` efectivo
- [ ] Sin secretos en capas ni en variables de build
- [ ] `--frozen-lockfile`
- [ ] Healthcheck definido y funcional
- [ ] Variables nuevas reflejadas en `.env.example` y en compose
- [ ] `docker compose config` válido y stack levantable

## Expected output

Dockerfiles multi-stage, compose válido y documentación de variables nuevas.

## Anti-patterns

- `FROM node:latest`
- Ejecutar como root
- `COPY . .` antes de instalar dependencias (invalida la caché en cada cambio)
- Secretos en `ARG` "porque solo es para el build"
- Imagen de producción con compiladores y devDependencies
- `docker compose up --build` como única forma de correr pruebas

## Definition of Done

Las imágenes se construyen, arrancan sanas, no contienen secretos y el stack local funciona.

## Related Skills

`nginx`, `azure-devops`, `security`, `observability`
