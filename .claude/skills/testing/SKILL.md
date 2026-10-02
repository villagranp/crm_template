---
name: testing
description: Decide qué pruebas requiere un cambio y garantiza que existan, sean significativas y estén en verde antes de DONE. Úsalo en todo cambio de comportamiento.
---

# Testing

## Purpose

Que cada criterio de aceptación tenga una prueba que lo verifique, y que ninguna feature
se declare terminada sin cobertura de riesgo.

## When to use

Todo cambio de comportamiento; toda corrección de bug; todo endpoint nuevo o modificado.

## Required context

`TESTING.md`, criterios de aceptación de la user story, pruebas existentes del área.

## Inputs

User story con AC, contrato de API, reglas de negocio, casos borde.

## Standards

| Nivel | Herramienta | Qué prueba |
|---|---|---|
| Unit | Vitest (frontend) / Jest (backend) | Reglas, mappers, utilidades, hooks |
| Integration | Jest + Supertest / `@nestjs/testing` | Endpoints, guards, repositorios |
| E2E | Playwright | Flujos de usuario críticos |

Por cada endpoint: happy path, validación, `401`, `403`, `404`, conflicto y casos borde.
Cada bug corregido trae regression test. Sin `skip` ni borrado de pruebas para pasar el pipeline.

## Process

1. Deriva un caso de prueba por cada criterio de aceptación.
2. Asigna el nivel más barato que da confianza real (no todo es E2E).
3. Escribe primero la prueba del camino de error más probable: suele revelar huecos del diseño.
4. Usa builders de datos, no fixtures gigantes compartidos.
5. Congela reloj y aleatoriedad; inyecta dependencias de tiempo.
6. Nombra las pruebas por comportamiento de negocio.
7. Verifica que la prueba **falla** sin el cambio. Si no, no prueba nada.
8. Ejecuta la suite completa y reporta el resultado real.

## Required checks

- [ ] ¿Un caso de prueba por cada AC?
- [ ] ¿Caminos de error cubiertos, no solo el happy path?
- [ ] ¿401 y 403 probados en cada endpoint protegido?
- [ ] ¿La prueba falla al revertir el cambio?
- [ ] ¿Deterministas: sin `sleep`, sin orden, sin reloj real, sin red externa?
- [ ] ¿Nombres que describen comportamiento, no implementación?
- [ ] ¿Sin datos reales ni PII en fixtures?
- [ ] ¿Suite completa ejecutada y en verde?

## Expected output

Pruebas en el nivel adecuado, con datos propios y resultado de ejecución reportado.

## Anti-patterns

- Pruebas que replican la implementación (`expect(service.method).toHaveBeenCalled()` como único assert).
- Mockear el objeto bajo prueba.
- Perseguir el porcentaje de cobertura con pruebas triviales de getters.
- `sleep(2000)` para "esperar a que cargue".
- `skip` en un test rojo para desbloquear el merge.
- Pruebas que dependen de datos que dejó otra prueba.

## Definition of Done

Todos los AC verificados por pruebas, suite en verde y resultado reportado con ejecución real.

## Related Skills

`user-story`, `api-design`, `authorization`, `security`, `backend-nestjs`, `frontend-react`
