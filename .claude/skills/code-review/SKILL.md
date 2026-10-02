---
name: code-review
description: Gate final antes de DONE. Revisa arquitectura, corrección de negocio, naming, estándares de API, seguridad, autenticación, autorización, pruebas, duplicación, complejidad, documentación y rendimiento.
---

# Code Review

## Purpose

Encontrar lo que el autor no puede ver, con criterios objetivos y severidad explícita.

## When to use

Siempre antes de declarar DONE, incluido el trabajo hecho por un agente (el autoreview
no sustituye la revisión, pero es obligatorio cuando no hay segundo revisor).

## Required context

User story y AC, implementation plan, `CODING-STANDARDS.md`, `API-STANDARDS.md`, `SECURITY.md`, ADRs.

## Inputs

Diff completo, pruebas, documentación, resultado real del pipeline.

## Standards

Severidades:

| Nivel | Significado |
|---|---|
| Bloqueante | No se mergea: seguridad, corrección, contrato, pruebas ausentes |
| Mayor | Debe corregirse ahora: arquitectura, estándares, duplicación relevante |
| Menor | Corregir si es barato: naming puntual, claridad |
| Sugerencia | Opcional, sin bloquear |

## Process

Revisa en este orden, de mayor a menor costo de corrección:

1. **Corrección de negocio** — ¿hace exactamente lo que dicen los AC? ¿Ni más, ni menos?
2. **Arquitectura** — capas, dirección de dependencias, fugas de infraestructura al dominio.
3. **Seguridad** — validación, secretos, datos sensibles, errores, inyección.
4. **Autenticación y autorización** — permiso correcto, propiedad del recurso, 401/403 probados.
5. **Contrato de API** — método, ruta, status codes, DTOs, formato de error, OpenAPI.
6. **Pruebas** — existen, son significativas, fallan sin el cambio, cubren errores.
7. **Datos** — migración segura, índices, tipos, consultas acotadas.
8. **Duplicación y complejidad** — ¿ya existía? ¿hay capas o abstracciones sin función?
9. **Naming y estilo** — conforme a estándares y coherente con el entorno.
10. **Rendimiento** — N+1, consultas sin límite, trabajo pesado en el request.
11. **Documentación** — actualizada, incluido `CHANGELOG.md` y ADR si aplica.
12. **Definition of Done** — verifícala punto por punto.

## Required checks

- [ ] AC cumplidos y verificados por pruebas
- [ ] Sin fugas de infraestructura al dominio
- [ ] Sin secretos ni datos sensibles expuestos
- [ ] Permiso declarado y probado (401 y 403)
- [ ] Contrato conforme y OpenAPI actualizado
- [ ] Pruebas significativas y en verde con ejecución real
- [ ] Sin duplicación evitable ni complejidad injustificada
- [ ] Documentación actualizada
- [ ] Definition of Done completa

## Expected output

```markdown
## Veredicto: aprobado | cambios requeridos | bloqueado
## Bloqueantes
## Mayores
## Menores
## Sugerencias
## Estado de la Definition of Done
```

Cada hallazgo indica archivo, línea, por qué es un problema y qué hacer.

## Anti-patterns

- "LGTM" sin haber leído el diff.
- Revisar solo el estilo y no la corrección ni la seguridad.
- Bloquear por preferencias personales sin norma que las respalde.
- Comentar sobre la persona en lugar del código.
- Aprobar con pipeline rojo "porque el fallo no es de este PR".
- Pedir cambios sin proponer alternativa.

## Definition of Done

Veredicto explícito, hallazgos con severidad y Definition of Done verificada punto por punto.

## Related Skills

`coding-standards`, `architecture`, `api-design`, `security`, `authorization`, `testing`, `documentation`
