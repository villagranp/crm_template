#!/usr/bin/env bash
# =============================================================================
# Local quality gate.
#
# Runs exactly what the pull request pipeline runs, in the same order, so that
# a pipeline failure can always be reproduced locally.
#
# Usage: ./infrastructure/scripts/verify.sh [--skip-tests]
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

SKIP_TESTS=false
if [[ "${1:-}" == "--skip-tests" ]]; then
  SKIP_TESTS=true
fi

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed. Run: corepack enable && corepack prepare pnpm@9.12.0 --activate" >&2
  exit 1
fi

log "Format check"
pnpm run format:check

log "Lint"
pnpm run lint

log "Type check"
pnpm run typecheck

if [[ "${SKIP_TESTS}" == "false" ]]; then
  log "Tests"
  pnpm run test
else
  echo "Skipping tests (--skip-tests)."
fi

log "Build"
pnpm run build

log "Dependency audit"
pnpm run audit:security

log "All checks passed"
