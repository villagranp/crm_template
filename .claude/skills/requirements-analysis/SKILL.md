---
name: requirements-analysis
description: Convierte un requerimiento crudo o ambiguo en un problema entendido, con alcance, restricciones, ambigüedades y assumptions explícitos. Úsalo al inicio de toda funcionalidad, antes de cualquier diseño.
---

# Requirements Analysis

## Purpose

Entender el problema real antes de proponer solución. La mayor parte del desperdicio en
desarrollo asistido por IA viene de implementar rápido lo que se entendió mal.

## When to use

- Llega un requerimiento nuevo o ambiguo.
- Un cambio afecta reglas de negocio.
- El usuario pide algo en términos de solución ("agrega un botón que…") y falta el problema.

## Required context

`CLAUDE.md`, documentación del dominio existente, user stories previas relacionadas, ADRs vigentes.

## Inputs

Texto del requerimiento, conversación con el solicitante, sistemas o procesos afectados.

## Standards

- Separar **problema** de **solución propuesta**. El solicitante suele traer la segunda.
- Toda regla de negocio no confirmada es una **assumption**, nunca un hecho.
- Alcance explícito: lo que entra y, sobre todo, lo que no.

## Process

1. Reformula el requerimiento con tus palabras y valídalo si hay interlocutor.
2. Identifica: actor, disparador, resultado esperado, valor de negocio.
3. Revisa qué existe ya (código, endpoints, tablas, historias) que resuelva parte del problema.
4. Lista ambigüedades como preguntas concretas y cerradas.
5. Documenta assumptions con su impacto si resultan falsas.
6. Define restricciones: legales, de datos, de rendimiento, de integración, de plazo.
7. Determina impacto preliminar en API, datos, seguridad y autorización.
8. Declara explícitamente el "out of scope".
9. Decide si el alcance cabe en una historia o debe dividirse.

## Required checks

- [ ] ¿Está claro el problema, no solo la solución pedida?
- [ ] ¿Hay actor y beneficio identificables?
- [ ] ¿Se revisó lo existente antes de proponer algo nuevo?
- [ ] ¿Las ambigüedades están formuladas como preguntas respondibles?
- [ ] ¿Cada assumption dice qué pasa si es falsa?
- [ ] ¿El out of scope está escrito?
- [ ] ¿Se detectó impacto en datos personales o en contratos existentes?

## Expected output

```markdown
## Problema
## Actor y beneficio
## Alcance
## Fuera de alcance
## Reglas de negocio identificadas
## Ambigüedades (preguntas abiertas)
## Assumptions (y riesgo si son falsas)
## Restricciones
## Impacto preliminar: API / datos / seguridad / autorización
## Recomendación: una historia o varias
```

## Anti-patterns

- Aceptar la solución propuesta sin entender el problema.
- Inventar reglas de negocio "razonables" y no marcarlas como assumption.
- Analizar sin revisar el código y la documentación existentes.
- Producir un análisis tan extenso que nadie lo lea: sé preciso, no prolijo.

## Definition of Done

El análisis permite escribir una user story que cumpla la Definition of Ready, o identifica
exactamente qué falta para lograrlo.

## Related Skills

`user-story`, `architecture`, `security`, `database`, `api-design`
