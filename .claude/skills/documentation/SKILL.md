---
name: documentation
description: Mantiene la documentación como código: OpenAPI, ADRs, docs de arquitectura y CHANGELOG actualizados junto al cambio, nunca después. Úsalo al cerrar cualquier cambio.
---

# Documentation

## Purpose

Que la documentación describa el sistema actual, no el de hace tres meses. Documentación
desactualizada es peor que ausente: induce a error a humanos y agentes.

## When to use

Al cerrar cualquier cambio que altere comportamiento, contrato, arquitectura, datos,
seguridad o forma de trabajar.

## Required context

Documentos raíz del repositorio, `docs/`, OpenAPI actual.

## Inputs

Cambio implementado, decisiones tomadas, impacto en contratos.

## Standards

- Documentación versionada junto al código, en el mismo PR.
- Diagramas en Mermaid dentro del Markdown, no como imágenes externas.
- Un hecho vive en un solo lugar; el resto enlaza. Sin copiar y pegar entre documentos.
- `CHANGELOG.md` en formato Keep a Changelog; toda ruptura de contrato aparece ahí.
- ADR para decisiones estructurales; el resto se documenta en el archivo relevante.

## Process

1. Determina qué documentos toca el cambio:
   - Endpoint → OpenAPI + `API-STANDARDS.md` si cambia una norma
   - Capas o límites → `ARCHITECTURE.md` + diagrama
   - Auth → `AUTHENTICATION.md`
   - Controles → `SECURITY.md`
   - Datos → `docs/database/`
   - Proceso o entorno → `DEVELOPMENT.md` / `CONTRIBUTING.md`
   - Decisión estructural → `docs/adr/`
   - Siempre que cambie el contrato → `CHANGELOG.md`
2. Escribe para quien llega nuevo: contexto, decisión, consecuencia.
3. Elimina lo que dejó de ser cierto en lugar de acumular capas contradictorias.
4. Verifica que los enlaces y las rutas mencionadas existan.
5. Comprueba que los diagramas Mermaid rendericen.

## Required checks

- [ ] ¿Todos los documentos afectados actualizados en este mismo cambio?
- [ ] ¿OpenAPI refleja el contrato real, con ejemplos?
- [ ] ¿`CHANGELOG.md` actualizado si cambió el contrato?
- [ ] ¿ADR creado si la decisión lo requería?
- [ ] ¿Sin información duplicada y contradictoria?
- [ ] ¿Enlaces y rutas válidos?
- [ ] ¿Diagramas Mermaid válidos?
- [ ] ¿Sin secretos ni datos reales en los ejemplos?

## Expected output

Documentación actualizada en el mismo PR, con enlaces válidos y sin contradicciones.

## Anti-patterns

- "Documento después del merge."
- Documentar la intención en lugar de lo implementado.
- Copiar la misma tabla en cuatro archivos que luego divergen.
- Ejemplos con credenciales o datos reales.
- Comentarios y README que contradicen el código.
- Documentos tan largos que nadie los lee; prefiere precisión sobre volumen.

## Definition of Done

Un desarrollador nuevo puede entender y operar el cambio leyendo solo la documentación.

## Related Skills

`adr`, `api-design`, `architecture`, `code-review`
