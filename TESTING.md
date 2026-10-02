# TESTING.md

Las pruebas no son opcional. Una feature sin pruebas apropiadas **no está terminada**.

---

## 1. Herramientas

| Ámbito | Herramientas |
|---|---|
| Frontend unit/component | Vitest + React Testing Library |
| Frontend E2E | Playwright |
| Backend unit/integration | Jest + `@nestjs/testing` |
| Backend API (integración) | Supertest |

Backend usa Jest por ser el default soportado por NestJS (ADR-013).

## 2. Pirámide

```text
        E2E            pocos, flujos críticos de negocio
     Integration       contratos de API, repositorios, guards reales
   Unit (mayoría)      reglas de negocio, mappers, utilidades, hooks
```

## 3. Qué se prueba en cada nivel

**Unit** — lógica pura, sin I/O: reglas de dominio, validaciones, cálculos, mappers, hooks.
**Integration** — módulo Nest real con dependencias sustituidas solo en los bordes externos;
endpoints vía Supertest; repositorios contra base de datos real (contenedor efímero).
**E2E** — recorrido de usuario completo por la SPA contra la API levantada.

## 4. Escenarios obligatorios por endpoint

Para cada endpoint se prueba como mínimo:

- [ ] Happy path (respuesta y forma esperadas)
- [ ] Validación (payload inválido → `400`/`422` con formato de error estándar)
- [ ] Sin autenticación → `401`
- [ ] Autenticado sin permiso → `403`
- [ ] Recurso inexistente → `404`
- [ ] Conflicto cuando aplique → `409`
- [ ] Casos borde relevantes (paginación vacía, límites, nulos, unicode, tamaños máximos)

## 5. Reglas

- Cada bug corregido incorpora un **regression test** que falla sin el fix.
- Prohibido eliminar o marcar `skip` un test para que pase el pipeline.
- Los tests no dependen de orden de ejecución, reloj real ni datos compartidos mutables.
- Fechas y aleatoriedad se inyectan o se congelan.
- Nada de `sleep`; se espera por condición.
- Los tests describen comportamiento de negocio, no implementación:
  `rejects an order without approval permission`, no `calls service.method once`.

## 6. Cobertura

No se persigue un porcentaje artificial. Se prioriza:

1. Reglas de negocio  2. Autorización  3. Seguridad  4. Caminos críticos  5. Casos borde

Umbral de referencia del pipeline: **80 % en `application/` y `domain/`**; el resto se evalúa por riesgo.
Un porcentaje alto con pruebas triviales es peor que uno moderado con pruebas significativas.

## 7. Datos de prueba

- Builders/factories por entidad, sin fixtures gigantes compartidos.
- Nunca datos reales de producción ni PII en fixtures.
- Base de datos de integración: contenedor efímero, migraciones aplicadas, limpieza por test.

## 8. Comandos

```bash
pnpm test                 # unit en todos los paquetes
pnpm --filter backend test:cov
pnpm --filter backend test:e2e
pnpm --filter frontend test
pnpm --filter frontend test:e2e
```

## 9. En el pipeline

`lint → typecheck → unit → integration → build → security checks`.
Un test rojo detiene el PR. No hay reintentos automáticos que oculten flakiness:
un test inestable se arregla o se retira con issue asociado.
