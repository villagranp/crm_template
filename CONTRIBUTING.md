# CONTRIBUTING.md

## 1. Ramas

```text
main        estable y desplegable
develop     integración
feature/*   nueva funcionalidad   → feature/US-014-customer-search
bugfix/*    corrección            → bugfix/US-021-pagination-offset
hotfix/*    urgencia sobre main   → hotfix/token-validation
```

Cambios de estrategia de ramas requieren ADR.

## 2. Commits — Conventional Commits

```text
feat:  fix:  docs:  test:  refactor:  perf:  security:  build:  ci:  chore:
```

```text
feat(customers): add permission-based filtering to list endpoint
fix(auth): reject tokens with unexpected audience
security(deps): bump vulnerable transitive dependency
```

Reglas: imperativo, ≤ 72 caracteres en el título, cuerpo con el **por qué**,
`BREAKING CHANGE:` explícito cuando rompe un contrato.

## 3. Pull Requests

Un PR = un propósito. Sin refactors no relacionados.

```markdown
## Historia / Issue
## Qué cambia y por qué
## Skills aplicados
## Impacto: API / datos / seguridad / autorización
## ADRs creados o afectados
## Pruebas ejecutadas
## Checklist de Definition of Done
## Riesgos y rollback
```

## 4. Gates del PR

`install → lint → typecheck → unit tests → integration tests → build → security checks`.

Ningún PR se mergea con pipeline rojo, sin pruebas o con documentación desactualizada.

## 5. Revisión

El revisor aplica el Skill [`code-review`](.claude/skills/code-review/SKILL.md) y verifica:
arquitectura, corrección de negocio, naming, estándares de API, seguridad, autenticación,
autorización, pruebas, duplicación, complejidad, documentación y rendimiento.

Comentarios sobre el código, no sobre la persona. Se sugiere alternativa, no solo objeción.

## 6. Dependencias

Antes de agregar una dependencia: ¿es necesaria?, ¿el stack actual ya lo resuelve?,
¿está mantenida?, ¿tiene CVEs?, ¿licencia compatible?, ¿es trivial de implementar?
Dependencia con impacto arquitectónico → ADR.
