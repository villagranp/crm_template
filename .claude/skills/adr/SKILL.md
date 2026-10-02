---
name: adr
description: Registra decisiones arquitectónicas relevantes con contexto, alternativas y consecuencias. Úsalo ante cualquier decisión que afecte arquitectura, seguridad, interoperabilidad, contrato público o modelo de datos.
---

# Architecture Decision Record

## Purpose

Dejar por escrito por qué el sistema es como es, para que nadie —humano o agente— revierta
una decisión sin conocer su razón.

## When to use

**Obligatorio** si la decisión afecta:

- arquitectura (capas, límites, patrones)
- seguridad (autenticación, autorización, criptografía, exposición de datos)
- interoperabilidad (protocolos, formatos, integraciones)
- contrato público (API, eventos)
- modelo de datos (entidades, motor, estrategia de persistencia)

También ante: framework nuevo, ORM nuevo, base de datos nueva, librería UI nueva,
estrategia de autenticación nueva, patrón arquitectónico nuevo, servicio de infraestructura nuevo.

**No se usa** para decisiones triviales o reversibles sin costo: esas se documentan inline.

## Required context

ADRs existentes en `docs/adr/` (para no contradecirlos), `ARCHITECTURE.md`, `SECURITY.md`.

## Inputs

Problema, restricciones, opciones consideradas, criterios de evaluación.

## Standards

- Numeración correlativa: `ADR-001`, `ADR-002`… Nunca se reutiliza un número.
- Un ADR no se edita para cambiar de opinión: se crea uno nuevo que **supersedes** al anterior,
  y el anterior pasa a `Superseded by ADR-XXX`.
- Estados: `Proposed`, `Accepted`, `Rejected`, `Deprecated`, `Superseded by ADR-XXX`.
- Se escriben al menos dos alternativas reales, con por qué se descartaron.

## Process

1. Revisa si ya existe un ADR sobre el tema.
2. Redacta el contexto: qué problema existe **hoy**, con datos, no con opiniones.
3. Enumera alternativas evaluadas con sus ventajas y desventajas.
4. Escribe la decisión en una frase clara y accionable.
5. Escribe las consecuencias: positivas, negativas y lo que queda bloqueado o habilitado.
6. Escribe las consideraciones de seguridad de la decisión.
7. Marca el estado y la fecha.
8. Enlaza el ADR desde `ARCHITECTURE.md` y desde el código afectado cuando aporte.

## Required checks

- [ ] ¿Contradice algún ADR vigente? Si sí, ¿lo supersede explícitamente?
- [ ] ¿Hay al menos dos alternativas reales evaluadas?
- [ ] ¿La decisión está redactada de forma accionable?
- [ ] ¿Están las consecuencias negativas, no solo las positivas?
- [ ] ¿Tiene sección de seguridad?
- [ ] ¿Está enlazado desde la documentación relevante?

## Expected output

```markdown
# ADR-XXX - Title

## Status
Accepted — 2026-09-22

## Context
## Decision
## Alternatives
## Consequences
## Security Considerations
```

## Anti-patterns

- ADR escrito después de implementar, para justificar lo ya hecho.
- "Alternativas: ninguna" — siempre existe al menos no hacer nada.
- Consecuencias solo positivas.
- Editar un ADR aceptado para cambiar la decisión.
- Un ADR por cada detalle trivial: dilución del mecanismo.

## Definition of Done

El ADR está en `docs/adr/`, con estado, alternativas, consecuencias y seguridad, y la
documentación afectada lo referencia.

## Related Skills

`architecture`, `security`, `database`, `api-design`, `documentation`
