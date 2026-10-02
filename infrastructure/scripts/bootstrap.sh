#!/usr/bin/env bash
# =============================================================================
# First-run setup for a fresh clone.
#
# Idempotent: safe to run again at any time. It never overwrites an existing
# .env file, because that file may hold real local credentials.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

log "Checking Node.js"
REQUIRED_NODE_MAJOR=22
CURRENT_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( CURRENT_NODE_MAJOR < REQUIRED_NODE_MAJOR )); then
  echo "Node ${REQUIRED_NODE_MAJOR}+ is required (see .nvmrc). Found: ${CURRENT_NODE_MAJOR}." >&2
  exit 1
fi

log "Enabling pnpm via corepack"
corepack enable
corepack prepare "$(node -p "require('./package.json').packageManager")" --activate

log "Creating environment files"
for target in ".env" "backend/.env"; do
  source_file="${target%.env}.env.example"
  [[ "${target}" == ".env" ]] && source_file=".env.example"
  if [[ -f "${target}" ]]; then
    echo "  ${target} already exists, leaving it untouched."
  elif [[ -f "${source_file}" ]]; then
    cp "${source_file}" "${target}"
    echo "  created ${target} from ${source_file}"
  fi
done

log "Installing dependencies"
pnpm install

log "Generating Prisma client"
pnpm --filter @app/backend exec prisma generate

cat <<'NEXT'

Setup complete. Next steps:

  1. Fill in the secrets in .env and backend/.env (never commit them).
  2. Start the database:   docker compose up -d postgres
  3. Apply the schema:     pnpm --filter @app/backend run prisma:migrate
  4. Start development:    pnpm run dev
  5. Read CLAUDE.md before writing any code.

NEXT
