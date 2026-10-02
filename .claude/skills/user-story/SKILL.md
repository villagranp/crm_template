---
name: user-story
description: Formaliza el alcance de una funcionalidad en una user story con criterios de aceptación verificables y Definition of Ready. Úsalo antes de cualquier diseño técnico o implementación.
---

# User Story

## Purpose

Fijar por escrito qué se va a construir, para quién, bajo qué reglas y cómo se verificará.
Es el contrato entre negocio, implementación y pruebas.

## When to use

Toda funcionalidad significativa. Un cambio cosmético no la necesita; un cambio de comportamiento sí.

## Required context

Salida de `requirements-analysis`, `API-STANDARDS.md`, `SECURITY.md`, historias relacionadas.

## Inputs

Problema entendido, reglas de negocio confirmadas, assumptions, restricciones.

## Standards

- Numeración correlativa: `US-001`, `US-002`… Archivo: `docs/user-stories/US-XXX-<slug>.md`.
- Criterios en Given/When/Then, cada uno verificable por una prueba automatizada.
- Toda historia declara su impacto en API, datos, seguridad y autorización.
- Los casos de error son parte de la historia, no un detalle de implementación.

## Process

1. Redacta descripción: `Como <rol> quiero <capacidad> para <beneficio>`.
2. Enumera las reglas de negocio confirmadas, una por línea, sin ambigüedad.
3. Escribe precondiciones.
4. Escribe criterios de aceptación numerados (`AC-01`, `AC-02`…), incluyendo caminos de error.
5. Enumera casos borde: vacíos, límites, concurrencia, datos inválidos, unicidad.
6. Define impacto de API (endpoints, contrato, versionado).
7. Define impacto de datos (entidades, campos, migraciones, retención).
8. Define consideraciones de seguridad (datos sensibles, exposición, validación).
9. Define autorización: **qué permiso `resource.action` protege esto**.
10. Define requisitos de prueba por nivel.
11. Lista dependencias y out of scope.
12. Valida la Definition of Ready.

## Required checks

- [ ] Cada AC es verificable y sin ambigüedad ("rápido", "amigable" no son criterios)
- [ ] Están los caminos de error, no solo el happy path
- [ ] El permiso requerido está declarado
- [ ] El impacto en datos y API está evaluado
- [ ] Las dependencias están identificadas
- [ ] Out of scope escrito
- [ ] Definition of Ready completa

## Expected output

```markdown
# US-XXX - Feature Name

## Description
Como [rol] quiero [capacidad] para [beneficio]

## Business Rules
## Preconditions

## Acceptance Criteria
### AC-01
Given …
When …
Then …

## Edge Cases
## API Impact
## Data Impact
## Security Considerations
## Authorization
## Testing Requirements
## Dependencies
## Out of Scope
```

## Anti-patterns

- Criterios de aceptación que describen implementación ("se crea un servicio que…").
- Historias sin caminos de error.
- "Como usuario quiero usar el sistema para trabajar mejor": sin actor ni beneficio reales.
- Historias que solo el autor entiende porque el contexto está en su cabeza.
- Cambiar los criterios después de implementar para que coincidan con lo hecho.

## Definition of Done

La historia cumple la Definition of Ready de `CLAUDE.md` §6 y QA puede derivar pruebas de ella
sin preguntar nada más.

## Related Skills

`requirements-analysis`, `api-design`, `authorization`, `testing`, `documentation`
