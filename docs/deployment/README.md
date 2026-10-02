# Deployment documentation

Pipelines live in `azure-pipelines/` (ADR-012). The Foundation builds and
verifies images but deliberately does **not** deploy: the target runtime is a
per-project decision that requires its own ADR.

| File | Contents |
|---|---|
| `environments.md` | Environments, URLs, owners and promotion path |
| `configuration.md` | Every environment variable, its owner and its source |
| `runbook-release.md` | Release steps, verification and rollback |
| `runbook-incident.md` | Triage, correlation ID lookup, escalation path |
| [`template-repository.md`](template-repository.md) | Publicar la plantilla en Azure DevOps y derivar proyectos de ella |

## Rules

1. Configuration comes from the environment. Nothing environment-specific is
   compiled into an image, except `VITE_*` values, which are public by design.
2. Secrets come from the platform secret store, never from a file in Git.
3. A release that cannot be rolled back must say so explicitly before it ships.
4. Health endpoints (`/api/v1/health`, `/api/v1/ready`) are the contract for
   readiness and liveness probes.
