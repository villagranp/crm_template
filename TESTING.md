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

### E2E de Clientes

`frontend/tests/e2e/crm-customers.e2e.spec.ts` (PF-02.52 a PF-02.54 del plan
`docs/implementation-plans/crm/02-clientes-cuentas.md`) crea clientes y
contactos con usuarios de la **semilla demo**. Usa su propio esquema,
`integration_e2e` (nunca `public` ni `integration_test`), que prepara y borra
`backend/scripts/e2e-stack.ts`. Las contraseñas llegan solo por el entorno;
elige valores de prueba de 12+ caracteres y no los escribas en archivos del repo.

Variables del recorrido (los valores entre `<>` son de ejemplo):

| Variable | Valor |
|---|---|
| `SEED_DEMO_PASSWORD` | `<12+>`: contraseña inicial de los usuarios demo |
| `ATTACHMENTS_STORAGE_PATH` | `<carpeta temporal>`: adjuntos demo y del recorrido, nunca `backend/storage` |
| `JWT_ACCESS_TOKEN_SECRET` | `<32+ bytes>` |
| `AUTH_DEFAULT_PASSWORD` | `<12+>` |
| `E2E_ASESOR_EMAIL` | `asesor1.gt@demo.invalid` (por defecto del script) |
| `E2E_ASESOR_PASSWORD` | `<12+>`: contraseña personal que el script le deja |
| `E2E_MANAGER_EMAIL` | `manager.gt@demo.invalid` (por defecto del script) |
| `E2E_MANAGER_PASSWORD` | `<12+>`: ídem |
| `E2E_MANAGER_DEPENDENT_CUSTOMER` | razón social de un cliente del equipo con proyectos (la imprime el script) |
| `E2E_FOREIGN_CUSTOMER_ID` | id de un cliente que el asesor no ve (lo imprime el script) |
| `E2E_COUNTRY` | país del alta; por defecto `Guatemala` |

Pasos (Git Bash, desde la raíz; exporta antes las variables de la tabla):

1. Esquema: `cd backend && pnpm exec ts-node --transpile-only scripts/e2e-stack.ts prepare`.
   Lo borra y recrea, migra, aplica la semilla esencial, pone
   `sistema.permite_datos_demo = true` **en ese esquema** y siembra la demo.
2. Backend en el puerto 3100 contra ese esquema, desde `backend/`:
   `DATABASE_URL=<la de .env con ?schema=integration_e2e> API_PORT=3100
   NODE_ENV=development AUTH_PROVIDER=local CORS_ALLOWED_ORIGINS=http://localhost:5180
   TS_NODE_PROJECT=tsconfig.json pnpm exec ts-node -r tsconfig-paths/register src/main.ts`.
   Se arranca desde el código fuente: `nest build` borra `backend/dist`, que es lo
   que ejecuta un `pnpm dev` abierto. Sin `pnpm dev` en marcha también vale
   `pnpm --filter @app/backend build` y `node backend/dist/src/main.js`.
3. Frontend, desde `frontend/`:
   `DEV_API_PROXY_TARGET=http://localhost:3100 pnpm exec vite --port 5180 --strictPort`.
4. Usuarios y clientes: con la misma `DATABASE_URL`,
   `E2E_API_URL=http://localhost:3100 pnpm exec ts-node --transpile-only scripts/e2e-stack.ts activate`.
   Cambia por la API (`POST /auth/password/change`) la contraseña inicial del
   asesor y del manager a `E2E_ASESOR_PASSWORD` / `E2E_MANAGER_PASSWORD`, elige
   los dos clientes comprobando por la API que el manager ve el primero y el
   asesor recibe `404` en el segundo, e imprime las variables `E2E_*` sin
   contraseñas. Es repetible: si la contraseña ya estaba cambiada, solo la comprueba.
5. `E2E_BASE_URL=http://localhost:5180 pnpm --filter @app/frontend test:e2e crm-customers`
   con las variables `E2E_*` del paso 4 y las contraseñas.
6. Limpieza: detén el backend y el Vite de los pasos 2 y 3 (no el `pnpm dev`
   de 3000/5173), `scripts/e2e-stack.ts drop` y borra la carpeta temporal de adjuntos.

Notas:

- La primera ejecución contra un Vite recién arrancado puede fallar con la
  pantalla en «Cargando…»: Vite compila bajo demanda cada ruta perezosa y tarda
  más que los 5 s de espera de Playwright. Repite el paso 5; con las rutas ya
  compiladas el recorrido tarda unos 25 s.
- El recorrido se puede repetir sin volver al paso 1 (sufijos únicos); el login
  admite 10 intentos por minuto por IP y cada ejecución hace 3.
- `e2e-stack.ts` se niega a trabajar sobre un esquema que no empiece por
  `integration_` o que sea `integration_test` (`E2E_SCHEMA` cambia el nombre).

### E2E de Actividad comercial

`frontend/tests/e2e/crm-commercial-activity.e2e.spec.ts` (PF-04.58 a PF-04.61 del
plan `docs/implementation-plans/crm/04-actividad-comercial.md`) usa el mismo
stack aislado que «E2E de Clientes» (`integration_e2e`, semilla esencial y demo,
carpeta temporal de adjuntos, backend en 3100 desde el código fuente, Vite en
5180). Crea visitas y actividades con asuntos y fechas propias, así que se puede
repetir sin volver a preparar el esquema.

Variables, además de las de «E2E de Clientes» (todas salvo la contraseña las
imprime `e2e-stack.ts activate`):

| Variable | Valor |
|---|---|
| `E2E_RESTRICTED_PASSWORD` | `<12+>`: con ella `activate` crea (o repone) los dos usuarios recortados de PF-04.60 con contraseña personal |
| `E2E_VISIT_VIEWER_EMAIL` | `lector.visitas@e2e.invalid`: rol `e2e-visitas-lectura` (`ORGANIZATION`, solo `visitas.ver` y la opción `actividad-visitas`) |
| `E2E_NO_ACTIVITY_EMAIL` | `sin.actividad@e2e.invalid`: rol `e2e-sin-actividad` (solo `clientes.ver` y `clientes-buscar`) |
| `E2E_PROJECT_ID`, `E2E_PROJECT_CODE`, `E2E_PROJECT_NAME` | proyecto demo del asesor |
| `E2E_PROJECT_CUSTOMER_ID`, `E2E_PROJECT_CUSTOMER_NAME` | su cliente (activo, del asesor): cliente de las visitas y actividades del recorrido |
| `E2E_CALL_TYPE_ID` | tipo de actividad «Llamada» |
| `E2E_DONE_VISIT_ID` | una visita demo `REALIZADA` |

Pasos: los 1 a 4 de «E2E de Clientes» con `E2E_RESTRICTED_PASSWORD` exportada en
el paso 4; después
`E2E_BASE_URL=http://localhost:5180 pnpm --filter @app/frontend test:e2e crm-commercial-activity`
con las variables impresas y las contraseñas. Limpieza: el paso 6.

Notas:

- **PF-04.58 sin el Módulo 3.** Esta rama no tiene ficha de proyecto ni API
  `/projects`. El recorrido parte de la URL que abre «Nueva actividad» en la
  ficha del proyecto (`/actividad/actividades/nueva?customerId&projectId&typeId`,
  E.11) y, solo en esa prueba, el navegador simula el Módulo 3 con
  `page.route`: añade la opción `proyectos-buscar` a la respuesta real de
  `GET /me/menu` y responde `GET /projects` con el proyecto demo real. El alta,
  el historial y el seguimiento son los del backend real, que valida el vínculo
  contra la tabla `projects`. Cuando el Módulo 3 se integre, se quita la
  simulación y se parte de su ficha.
- El recorrido inicia sesión una vez por usuario (4 accesos) y reutiliza la
  sesión en las cuatro pruebas. El login admite 10 intentos por minuto por IP:
  `activate` hace hasta 4 y la batería completa más de 10, así que para correr
  **todos** los E2E se separan en dos tandas con más de un minuto entre ellas:
  (1) `auth-local smoke crm-customers` con la contraseña inicial del
  administrador y (2) `admin-access crm-commercial-activity` con la ya cambiada
  (`E2E_ADMIN_PASSWORD = E2E_ADMIN_NEW_PASSWORD`). `auth-local` exige volver al
  paso 1 antes de repetirlo.
- Con varios navegadores en paralelo la SPA puede pasar de 120 peticiones por
  minuto desde la misma IP: en el stack aislado se arranca el backend con
  `RATE_LIMIT_MAX_REQUESTS=5000` (solo ese proceso; no cambia el login).
- Las fechas se escriben y se comprueban en la zona horaria del sistema, que es
  la del navegador de Playwright.
- Al arrancar una tanda, varios Chromium y Vite compiten por la CPU con el
  backend y PostgreSQL: un login (Argon2id y varias escrituras) llegó a tardar
  6,6 s, más que los 5 s de `expect`. Tras pulsar «Iniciar sesión» o «Guardar
  contraseña» las pruebas esperan la respuesta real (`POST /auth/login`,
  `POST /auth/password/change`, `GET /me/menu`) y comprueban su status antes de
  mirar la pantalla; no se suben los timeouts de `expect`.
- En `<etiqueta>-backend.log`, cada `http_request` lleva el status que recibió
  el cliente (los `POST /auth/refresh` sin cookie son `401`). Un `500` siempre
  va acompañado de `unhandled_exception` con el mismo `correlationId`.

## 9. En el pipeline

`lint → typecheck → unit → integration → build → security checks`.
Un test rojo detiene el PR. No hay reintentos automáticos que oculten flakiness:
un test inestable se arregla o se retira con issue asociado.
