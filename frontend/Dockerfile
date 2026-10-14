# syntax=docker/dockerfile:1
# =============================================================================
# Frontend image — multi-stage build.
#
# Build context is the REPOSITORY ROOT (see docker-compose.yml): pnpm workspace
# manifests and tsconfig.base.json are needed to install and type-check.
#
# Stages: deps -> build -> development | production
# The production stage is NGINX serving the static bundle as an unprivileged
# user on port 8080. It is NOT the edge proxy (infrastructure/nginx/).
# =============================================================================

ARG NODE_VERSION=22.20.0
ARG NGINX_VERSION=1.27

# ---------- deps ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json frontend/
RUN pnpm install --filter @app/frontend... --frozen-lockfile \
    || pnpm install --filter @app/frontend...

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /repo
RUN corepack enable

# VITE_* values are baked into the bundle and are PUBLIC.
# Never pass secrets as build arguments.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_AUTH_PROVIDER=local
ARG VITE_ENTRA_CLIENT_ID=
ARG VITE_ENTRA_TENANT_ID=
ARG VITE_ENTRA_AUTHORITY=
ARG VITE_ENTRA_REDIRECT_URI=
ARG VITE_ENTRA_API_SCOPE=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_AUTH_PROVIDER=${VITE_AUTH_PROVIDER} \
    VITE_ENTRA_CLIENT_ID=${VITE_ENTRA_CLIENT_ID} \
    VITE_ENTRA_TENANT_ID=${VITE_ENTRA_TENANT_ID} \
    VITE_ENTRA_AUTHORITY=${VITE_ENTRA_AUTHORITY} \
    VITE_ENTRA_REDIRECT_URI=${VITE_ENTRA_REDIRECT_URI} \
    VITE_ENTRA_API_SCOPE=${VITE_ENTRA_API_SCOPE}

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/frontend/node_modules ./frontend/node_modules
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY frontend ./frontend
WORKDIR /repo/frontend
RUN pnpm run build

# ---------- development ----------
FROM node:${NODE_VERSION}-alpine AS development
WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=development
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/frontend/node_modules ./frontend/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY frontend ./frontend
WORKDIR /repo/frontend
EXPOSE 5173
USER node
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]

# ---------- production ----------
FROM nginx:${NGINX_VERSION}-alpine AS production

COPY frontend/nginx/static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html

# Binding to 8080 keeps the process unprivileged (no CAP_NET_BIND_SERVICE).
RUN touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html

EXPOSE 8080
USER nginx

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
