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

ARG NODE_VERSION=22.12.0

# ---------- deps ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/
RUN pnpm install --filter @app/backend... --frozen-lockfile \
    || pnpm install --filter @app/backend...

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/backend/node_modules ./backend/node_modules
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY backend ./backend
WORKDIR /repo/backend
RUN pnpm prisma generate && pnpm run build && pnpm prune --prod

# ---------- development ----------
FROM node:${NODE_VERSION}-alpine AS development
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
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# The unprivileged `node` user ships with the base image. The container never
# runs as root and never contains build tooling or source maps.
COPY --from=build --chown=node:node /repo/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/backend/dist ./dist
COPY --from=build --chown=node:node /repo/backend/prisma ./prisma
COPY --from=build --chown=node:node /repo/backend/package.json ./package.json

# Punto de montaje de los adjuntos (ADR-021). Se crea en la imagen con dueño
# `node` para que un volumen con nombre herede ese dueño; la imagen nunca
# contiene adjuntos.
RUN mkdir -p /app/storage/attachments && chown -R node:node /app/storage

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
