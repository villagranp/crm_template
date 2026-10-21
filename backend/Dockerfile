# syntax=docker/dockerfile:1
# =============================================================================
# Backend image — multi-stage build.
#
# Build context is the REPOSITORY ROOT (see docker-compose.yml) because this is
# a pnpm workspace: the lockfile, the workspace manifest and tsconfig.base.json
# live at the root and are required for a reproducible install.
#
# Stages: deps -> build -> development | production
# =============================================================================

# Base images are pinned by DIGEST (ASVS 5.0 G-22): the tag alone can be
# re-pointed upstream. The digest is the multi-arch index of that exact tag on
# Docker Hub; when Docker gets both, it pulls the digest and ignores the tag, so
# a version bump MUST update the digest too:
#   docker buildx imagetools inspect node:<version>-alpine   (line "Digest:")
# or, without Docker, GET https://hub.docker.com/v2/repositories/library/node/tags/<version>-alpine
# (field "digest").
ARG NODE_VERSION=22.20.0
ARG NODE_DIGEST=sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467aaaea42d6225af

# ---------- deps ----------
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/
# Always the committed lockfile (ASVS 5.0 G-22): no fallback that would
# resolve versions at build time. A stale lockfile fails the build, as in CI.
RUN pnpm install --filter @app/backend... --frozen-lockfile

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/backend/node_modules ./backend/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY backend ./backend
WORKDIR /repo/backend
RUN pnpm prisma generate && pnpm run build
# En un workspace de pnpm, backend/node_modules son enlaces al almacén de la raíz:
# copiarlos tal cual deja la imagen sin dependencias (`Cannot find module`).
# `pnpm deploy --prod` produce un node_modules autocontenido solo con las de
# producción; el cliente de Prisma se regenera dentro de él.
WORKDIR /repo
RUN pnpm --filter @app/backend deploy --prod /out \
 && cp -r /repo/backend/prisma /out/prisma \
 && /repo/backend/node_modules/.bin/prisma generate --schema /out/prisma/schema.prisma

# ---------- development ----------
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS development
WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=development
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/backend/node_modules ./backend/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY backend ./backend
WORKDIR /repo/backend
EXPOSE 3000
USER node
CMD ["pnpm", "run", "dev"]

# ---------- production ----------
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS production
WORKDIR /app
ENV NODE_ENV=production

# The unprivileged `node` user ships with the base image. The container never
# runs as root and never contains build tooling or source maps.
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/backend/dist ./dist
COPY --from=build --chown=node:node /out/prisma ./prisma
COPY --from=build --chown=node:node /out/package.json ./package.json

# Punto de montaje de los adjuntos (ADR-021). Se crea en la imagen con dueño
# `node` para que un volumen con nombre herede ese dueño; la imagen nunca
# contiene adjuntos.
RUN mkdir -p /app/storage/attachments && chown -R node:node /app/storage

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
