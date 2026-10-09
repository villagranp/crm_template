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
- Base de datos de integración: esquema `integration_test` dentro de la base de
  `DATABASE_URL`. `backend/test/global-setup.ts` lo borra, lo migra y lo siembra
  en cada ejecución; el esquema de desarrollo (`public`) nunca se toca. Cada
  prueba crea sus propios usuarios con correo único.

## 8. Comandos

```bash
pnpm test                 # unit en todos los paquetes
pnpm --filter backend test:cov
pnpm --filter backend test:e2e
pnpm --filter frontend test
pnpm --filter frontend test:e2e
```

### E2E del acceso local

`frontend/tests/e2e/auth-local.e2e.spec.ts` cambia la contraseña del
administrador, así que **no se ejecuta contra la base de desarrollo** y se
salta si faltan sus variables. Recorrido aislado:

1. `pnpm --filter @app/backend test:e2e`: deja `integration_test` recién
   sembrado (admin `admin@integration.test` con contraseña inicial pendiente).
2. Backend contra ese esquema en otro puerto: `DATABASE_URL` con
   `?schema=integration_test`, `API_PORT=3100`, `NODE_ENV=development`,
   `JWT_ACCESS_TOKEN_SECRET` (≥ 32 bytes); `node backend/dist/src/main.js`.
3. Frontend: `DEV_API_PROXY_TARGET=http://localhost:3100 pnpm exec vite --port 5180`.
4. `E2E_BASE_URL=http://localhost:5180 E2E_ADMIN_EMAIL=admin@integration.test
   E2E_ADMIN_PASSWORD=<SEED_ADMIN_PASSWORD de backend/test/support/integration-env.ts>
   E2E_ADMIN_NEW_PASSWORD=<12+ caracteres> pnpm --filter @app/frontend test:e2e`.

Para repetirlo, vuelve al paso 1.

### E2E de administración

`frontend/tests/e2e/admin-access.e2e.spec.ts` crea un rol propio, da de alta un
usuario con ese rol, comprueba que solo ve su menú y que suspendido ya no
entra. Usa el mismo stack aislado, con dos diferencias:

- El backend necesita `AUTH_DEFAULT_PASSWORD` (12+ caracteres).
- El administrador ya **no** debe tener el cambio de contraseña pendiente:
  ejecuta antes `auth-local.e2e.spec.ts`, que lo cambia.

Variables: `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (la contraseña ya cambiada),
`E2E_DEFAULT_PASSWORD` (= `AUTH_DEFAULT_PASSWORD`) y `E2E_NEW_USER_PASSWORD`
(12+). Cada ejecución deja un rol y un usuario nuevos con sufijo único; vuelve
al paso 1 de vez en cuando para empezar de una base limpia.

## 9. En el pipeline

`lint → typecheck → unit → integration → build → security checks`.
Un test rojo detiene el PR. No hay reintentos automáticos que oculten flakiness:
un test inestable se arregla o se retira con issue asociado.
