---
name: feature-development
description: Orquestador obligatorio de toda funcionalidad. Determina qué Skills aplican, en qué orden, y bloquea el desarrollo hasta que el análisis, el contrato y el plan estén completos. Úsalo siempre que un cambio altere el comportamiento del sistema.
---

# Feature Development

## Purpose

Garantizar que ninguna funcionalidad se implemente sin análisis, contrato, plan y pruebas.
Este Skill coordina a todos los demás. **No asumas que el desarrollador recordará las reglas:
este Skill lo dirige explícitamente a los Skills relacionados.**

## When to use

Siempre que exista un cambio funcional: nuevo endpoint, nueva pantalla, cambio de regla de
negocio, cambio de modelo de datos, cambio de autenticación o autorización, integración nueva.

**No aplica** al Fast Path de `CLAUDE.md` §9 (typos, textos, estilos sin cambio de comportamiento).

## Required context

- `CLAUDE.md`, `AGENTS.md`
- `ARCHITECTURE.md`, `API-STANDARDS.md`, `CODING-STANDARDS.md`, `SECURITY.md`
- ADRs vigentes en `docs/adr/`
- User stories y planes previos relacionados

## Inputs

- Requerimiento en cualquier forma (ticket, mensaje, correo).
- Código y documentación existentes del área afectada.

## Standards

El flujo es obligatorio y secuencial:

```text
REQUIREMENT → REQUIREMENTS ANALYSIS → USER STORY → ACCEPTANCE CRITERIA
→ ARCHITECTURE REVIEW → SECURITY REVIEW → DATA REVIEW → API CONTRACT
→ TEST PLAN → IMPLEMENTATION PLAN → IMPLEMENTATION
→ UNIT TESTS → INTEGRATION TESTS → E2E TESTS → CODE REVIEW → DOCUMENTATION → DONE
```

## Process

### Fase 0 — Selección de Skills (obligatoria, antes de leer código)

Marca los Skills que aplican y decláralos en tu respuesta:

| Condición del cambio | Skill obligatorio |
|---|---|
| Siempre | `requirements-analysis`, `user-story`, `coding-standards`, `testing`, `documentation`, `code-review` |
| Cruza capas, módulos o dependencias | `architecture` |
| Decisión estructural / de seguridad / de contrato | `adr` |
| Crea o cambia un endpoint | `api-design` |
| Toca `frontend/` | `frontend-react` |
| Toca `backend/` | `backend-nestjs` |
| Login, tokens, sesión, providers | `authentication` |
| Microsoft Entra ID | `entra-id` |
| Roles, permisos, guards | `authorization` |
| Entradas externas, datos sensibles, secretos, dependencias | `security` |
| Modelo o acceso a datos | `database` |
| Schema o migraciones Prisma | `prisma` |
| Analytics, reporting, data products | `snowflake` |
| Imágenes, compose, runtime | `docker` |
| Proxy, routing, headers | `nginx` |
| Pipelines | `azure-devops` |
| Logs, correlation, health | `observability` |

Ante la duda, **incluye** el Skill.

### Fase 1 — Entender

1. Aplica `requirements-analysis`: objetivo, actor, alcance, ambigüedades, assumptions.
2. Revisa documentación y código existentes antes de proponer nada.
3. Si falta información de negocio: **pregunta**. No inventes reglas.

### Fase 2 — Especificar

4. Aplica `user-story`: crea o actualiza `docs/user-stories/US-XXX-<slug>.md`.
5. Define criterios de aceptación Given/When/Then verificables.
6. Valida la **Definition of Ready**. Si falla, detente aquí.

### Fase 3 — Diseñar

7. `architecture`: impacto en capas, puertos, dependencias. ¿Requiere ADR?
8. `security`: superficie de ataque, datos sensibles, controles necesarios.
9. `database`: entidades, migraciones, puertos de acceso.
10. `api-design`: contrato completo del endpoint antes de escribirlo.
11. `authorization`: permiso `resource.action` que protege el cambio.
12. `testing`: plan de pruebas por nivel.

### Fase 4 — Planear

13. Crea `docs/implementation-plans/US-XXX-plan.md` con el formato estándar.
14. Enumera archivos a crear/modificar, riesgos y estrategia de rollback.

### Fase 5 — Implementar

15. Implementa en orden: dominio → aplicación → infraestructura → presentación → frontend.
16. Aplica `coding-standards` en cada archivo.
17. Escribe las pruebas junto al código, no después.

### Fase 6 — Verificar

18. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
19. Integración y E2E cuando apliquen.
20. `security`: revisión final.
21. `documentation`: OpenAPI, docs afectadas, `CHANGELOG.md`.
22. `code-review`: gate final.

## Required checks

- [ ] Skills seleccionados y declarados antes de tocar código
- [ ] User story existente y con Definition of Ready cumplida
- [ ] Contrato de API definido antes de implementar
- [ ] Permiso de autorización decidido y probado
- [ ] Implementation plan escrito
- [ ] Pruebas por cada criterio de aceptación
- [ ] lint, typecheck, unit, integration, build en verde
- [ ] Documentación y OpenAPI actualizados
- [ ] Definition of Done completa

## Expected output

1. Lista de Skills aplicados.
2. `docs/user-stories/US-XXX-<slug>.md`.
3. `docs/implementation-plans/US-XXX-plan.md`.
4. Código y pruebas.
5. Documentación y OpenAPI actualizados.
6. Reporte final con el formato de `AGENTS.md` §7.

## Anti-patterns

- Empezar a escribir código "para entender el problema".
- Escribir la user story después de implementar, para cumplir el trámite.
- Declarar Skills y no aplicarlos.
- Definir el contrato de API leyendo el código ya escrito.
- Dejar autorización "para después".
- Escribir pruebas que replican la implementación en lugar del comportamiento.
- Marcar DONE con el pipeline rojo o la documentación desactualizada.

## Definition of Done

La de `CLAUDE.md` §7, íntegra y verificada con ejecución real.

## Related Skills

Todos. Este Skill es el punto de entrada del resto.
