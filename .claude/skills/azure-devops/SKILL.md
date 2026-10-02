---
name: azure-devops
description: Define pipelines de CI/CD en Azure DevOps con gates reales (lint, typecheck, tests, build, security) y plantillas reutilizables. Úsalo al crear o modificar pipelines.
---

# Azure DevOps

## Purpose

Que ningún cambio llegue a `main` sin pasar las mismas verificaciones, de forma reproducible
y sin secretos en el repositorio.

## When to use

Cambios en `azure-pipelines/`, en los gates de PR o en el proceso de build/despliegue.

## Required context

ADR-012, pipelines actuales, scripts del `package.json` raíz.

## Inputs

Ramas involucradas, pasos requeridos, artefactos a publicar, entornos destino.

## Standards

Pipeline de PR (obligatorio):

```text
install → lint → typecheck → unit tests → integration tests → build → security checks
```

- Node y pnpm fijados por versión (`.nvmrc`, `packageManager`).
- `pnpm install --frozen-lockfile`.
- Caché de store de pnpm para acelerar, nunca para omitir pasos.
- Publicación de resultados de pruebas y cobertura.
- Secretos únicamente desde variable groups seguros o Key Vault.
- Plantillas reutilizables en `azure-pipelines/templates/`.
- El pipeline falla ante error real; sin reintentos que oculten flakiness.

## Process

1. Reutiliza plantillas para setup, verificación y build; evita duplicar YAML.
2. Declara los triggers explícitamente (`main`, `develop`, PR).
3. Fija versiones de herramientas; nada de `latest`.
4. Ejecuta los mismos comandos que `pnpm verify` en local: el CI no debe ser una sorpresa.
5. Publica artefactos versionados (build del frontend, imagen del backend).
6. Añade `pnpm audit --audit-level=high` como paso de seguridad.
7. Prepara —sin activar— los pasos de Docker build, scan de imagen, push y deploy.
8. Documenta las variables y grupos requeridos en `docs/deployment/`.

## Required checks

- [ ] ¿Gates completos: lint, typecheck, unit, integration, build, security?
- [ ] ¿`--frozen-lockfile`?
- [ ] ¿Versiones fijadas?
- [ ] ¿Sin secretos en el YAML?
- [ ] ¿Resultados de pruebas y cobertura publicados?
- [ ] ¿Plantillas reutilizadas en lugar de YAML duplicado?
- [ ] ¿El pipeline falla realmente cuando algo falla?
- [ ] ¿Variables documentadas?

## Expected output

Pipelines y plantillas en `azure-pipelines/`, con documentación de variables y artefactos.

## Anti-patterns

- `continueOnError: true` en un paso de verificación.
- Instalar dependencias sin lockfile congelado.
- Secretos en variables planas del YAML.
- Duplicar el mismo bloque de pasos en tres pipelines.
- Desplegar sin artefacto versionado ni trazabilidad de commit.
- Reintentar automáticamente pruebas inestables en lugar de arreglarlas.

## Definition of Done

El PR pipeline ejecuta todos los gates, falla ante errores reales y no expone secretos.

## Related Skills

`docker`, `testing`, `security`, `observability`
