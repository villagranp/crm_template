# ADR-012 - Azure DevOps como CI/CD

## Status
Accepted — 2026-09-22

## Context
La organización usa Azure DevOps para repositorios, boards y pipelines. Se requiere que cada PR
pase las mismas verificaciones, de forma reproducible y sin secretos en el repositorio.

## Decision
Azure DevOps Pipelines como CI/CD principal. Pipeline de PR con gates obligatorios:
`install → lint → typecheck → unit tests → integration tests → build → security checks`.
Pipelines separados para frontend y backend, con plantillas reutilizables en
`azure-pipelines/templates/`. Los pasos de Docker build, scan, push y deploy quedan preparados
pero **no** configurados contra entornos reales.

## Alternatives
- **GitHub Actions**: excelente ecosistema, fuera del estándar corporativo actual.
- **Jenkins**: máxima flexibilidad, coste de mantenimiento propio del servidor y de los agentes.

## Consequences
- Integración natural con boards, artefactos y variable groups de la organización.
- Los mismos comandos que `pnpm verify` se ejecutan en local y en CI, sin sorpresas.
- Coste: YAML específico de Azure, que se mitiga con plantillas.

## Security Considerations
Secretos solo desde variable groups seguros o Key Vault, nunca en el YAML.
`--frozen-lockfile` garantiza dependencias reproducibles. `pnpm audit` corre como gate.
