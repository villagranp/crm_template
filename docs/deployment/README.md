# Deployment documentation

Pipelines live in `azure-pipelines/` (ADR-012). The Foundation builds and
verifies images but deliberately does **not** deploy: the target runtime is a
per-project decision that requires its own ADR.

| File | Contents |
|---|---|
| [`environments.md`](environments.md) | Modelo de base de datos por entorno, convención de nombres y credenciales |
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

## Tareas programadas de operación

### Purga de datos de la carga masiva de clientes (CRM, 06 RN-06.29, D-06.12)

`customer_import_rows.raw_data` guarda los valores leídos de cada fila (pueden incluir correos y
teléfonos). La aplicación no tiene planificador: la operación del entorno programa, una vez al
día, desde el directorio del backend y con la `DATABASE_URL` del entorno:

```bash
pnpm --filter @app/backend run imports:purge-rows
```

- Sustituye por `{}` el `raw_data` de las cargas cerradas (o creadas y nunca cerradas) hace más
  de `crm.importaciones.dias_retencion_filas` días (90 por defecto). No toca cargas activas.
- Conserva el registro de cada carga, sus contadores, estados e incidencias (no contienen valores).
- Idempotente; escribe una línea JSON `{"event":"customer_import_rows_purged","purgedRows":N,...}`
  sin datos personales; si falla, sale con código 1.
- Necesita las dependencias de desarrollo (`ts-node`), igual que las semillas.
