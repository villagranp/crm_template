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

### E2E de Proyectos

`frontend/tests/e2e/projects.e2e.spec.ts` (PF-03.114 a PF-03.116 del plan
`docs/implementation-plans/crm/03-proyectos.md`) y
`frontend/tests/e2e/forecast.e2e.spec.ts` (forecast M+6, AC-03.69/AC-03.70) usan el
**mismo stack aislado** que «E2E de Clientes» (esquema `integration_e2e`, backend desde
el código fuente en 3100, Vite en 5180) y los mismos pasos 1–3 y 6.

| Recorrido | Qué cubre |
|---|---|
| PF-03.114 | Asesor: alta → clasificación por regla → fase → oportunidad en USD → producto asociado → forecast M+1…M+3 → cierre Ganado como Parcial 60 % → historial |
| PF-03.115 | Manager: vista de equipo, reasigna el asesor y duplica con productos |
| PF-03.116 | Asesor: un proyecto ajeno dice «no existe o no tienes acceso»; un usuario sin `forecast.ver` no ve la opción y la ruta muestra «Sin acceso» |
| Forecast M+6 | Carga de la ventana vigente, guardado de celdas y upsert de la misma línea |

Variables, además de las de «E2E de Clientes» (los valores entre `<>` son de ejemplo):

| Variable | Valor |
|---|---|
| `E2E_ASESOR_CUSTOMER` | razón social de un cliente activo del asesor (la imprime `activate`) |
| `E2E_MANAGER_TEAM_PROJECT` | código de un proyecto de otro asesor que el manager administra (ídem) |
| `E2E_FOREIGN_PROJECT_ID` | id de un proyecto que el asesor no ve (ídem) |
| `E2E_PRODUCT_SKU` | SKU de un producto activo del catálogo (ídem) |
| `E2E_RULE_UNIT` | nombre de una unidad con regla GLOBAL activa a toneladas (ídem) |
| `E2E_NO_FORECAST_PASSWORD` | `<12+>`: si se define **antes** de `activate`, el script crea en el esquema aislado el rol propio `e2e_asesor_sin_forecast` (el asesor sin `forecast.*` ni la opción de menú que lo exige) y un usuario activo con él |
| `E2E_NO_FORECAST_EMAIL` | `sin.forecast@e2e.invalid` (por defecto del script; lo imprime `activate`) |

Pasos (Git Bash, desde la raíz):

1. Pasos 1–3 de «E2E de Clientes» (`prepare`, backend en 3100, Vite en 5180).
2. Con `E2E_NO_FORECAST_PASSWORD` ya exportada,
   `cd backend && E2E_API_URL=http://localhost:3100 pnpm exec ts-node --transpile-only scripts/e2e-stack.ts activate`
   y exporta las líneas `E2E_*` que imprime (sin contraseñas). Es idempotente: repone el
   rol y la contraseña del usuario sin forecast.
3. `E2E_BASE_URL=http://localhost:5180 pnpm --filter @app/frontend test:e2e projects forecast crm-customers`
   con esas variables y las contraseñas `E2E_ASESOR_PASSWORD`, `E2E_MANAGER_PASSWORD` y
   `E2E_NO_FORECAST_PASSWORD`.
4. Limpieza: paso 6 de «E2E de Clientes» (detén solo 3100 y 5180, `e2e-stack.ts drop`,
   borra la carpeta temporal de adjuntos y los `test-results`).

Notas:

- **Límite de login:** 10 intentos por minuto por IP. `activate` hace hasta 5 y una
  ejecución completa de los tres archivos hace 8; deja pasar un minuto entre `activate` y
  la ejecución, y entre dos ejecuciones seguidas. Si no, el login responde «Demasiados
  intentos» y el primer recorrido falla en el inicio de sesión.
- La primera ejecución tras arrancar Vite puede fallar con la página en blanco: Vite
  optimiza dependencias nuevas (iconos de MUI de las pantallas de proyectos) y recarga
  la página. Repite; con las dependencias ya optimizadas no vuelve a pasar.
- Sin `E2E_NO_FORECAST_PASSWORD` la prueba «sin forecast.ver» se salta; ningún rol de la
  demo cumple «`proyectos.ver` sin `forecast.ver`».
- PF-03.115 reasigna el asesor del proyecto de equipo en cada ejecución y crea una copia;
  PF-03.114 y el forecast crean proyectos con sufijo único. Todo es repetible sin volver
  a `prepare`.
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

- **PF-04.58** parte de la ficha real del proyecto demo
  (`/proyectos/:projectId?seccion=seguimiento`, Módulo 3): pulsa «Nueva
  actividad» de la sección «Seguimiento comercial» (E.11) y comprueba la llamada
  en esa sección, en el historial y en el seguimiento. `activate` elige como
  `E2E_PROJECT_*` un proyecto distinto del `E2E_MANAGER_TEAM_PROJECT` que
  reasigna PF-03.115, así que el orden de las suites no importa.
- El recorrido inicia sesión una vez por usuario (4 accesos) y reutiliza la
  sesión en las cuatro pruebas. El login admite 10 intentos por minuto por IP:
  `activate` hace hasta 5 (4 sin `E2E_NO_FORECAST_PASSWORD`) y la batería
  completa más de 10, así que para correr **todos**
  los E2E se separan en tres tandas con más de un minuto entre ellas (y tras
  `activate`): (1) `auth-local smoke crm-customers` con la contraseña inicial
  del administrador, (2) `admin-access crm-commercial-activity` con la ya
  cambiada (`E2E_ADMIN_PASSWORD = E2E_ADMIN_NEW_PASSWORD`) y (3) `projects
  forecast` («E2E de Proyectos», con `E2E_NO_FORECAST_PASSWORD`).
  `auth-local` exige volver al paso 1 antes de repetirlo.
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

### E2E de Inicio

`frontend/tests/e2e/dashboard.e2e.spec.ts` (PF-01.23, PF-01.41 y PF-01.48 del plan
`docs/implementation-plans/crm/01-inicio-dashboard.md`) usa el **mismo stack aislado**
que «E2E de Clientes» (pasos 1–3 y 6) y solo lee: se repite sin volver a `prepare`.

| Recorrido | Qué cubre |
|---|---|
| PF-01.48 (asesor) | Hero con el saludo y el nombre de `GET /me`; K1–K8 sin error y con la cifra exacta de cada `GET /dashboard/indicators/*`; bandeja de alertas, próximas visitas y actividad reciente |
| PF-01.48 (sin permisos comerciales) | Usuario con el rol `usuario`: Hero, «Mi acceso», accesos y el aviso «Todavía no tienes indicadores comerciales asignados»; ninguna tarjeta ni bloque comercial y **ninguna** petición a `/dashboard/*` (AC-01.5) |
| PF-01.23 | K2 → `/proyectos/oportunidades?status=OPEN` y K1 → `/proyectos?active=true` con el mismo total que la tarjeta (API y «Mostrando … de N»); K6–K8 enlazan a `/actividad/visitas?statusGroup=PENDING` y `/actividad/pendientes` con su `bucket` (AC-01.17) |
| PF-01.41 | Manager (TEAM): el resumen `ACTIVIDAD_VENCIDA`, la bandeja filtrada, K8 y `GET /activities/pending?bucket=OVERDUE` (tras pulsar K8) cuentan lo mismo; «Abrir» de una actividad vencida lleva a `/actividad/actividades/:id` y el de proyecto u oportunidad, a su ficha (AC-01.31) |

PF-01.41 no recorre «completar la actividad y la alerta desaparece»: gastaría los datos demo y
los recorridos deben poder repetirse sin `prepare` (lo cubre la prueba de integración de
PF-01.41). Usa el manager porque el asesor de la demo (`asesor1.gt`) no tiene actividades
vencidas y su equipo sí.

Variables, además de las de «E2E de Clientes» (los valores entre `<>` son de ejemplo):

| Variable | Valor |
|---|---|
| `E2E_NO_COMMERCIAL_PASSWORD` | `<12+>`: si se define **antes** de `activate`, el script crea en el esquema aislado un usuario activo con el rol esencial `usuario` (sin permisos; ningún usuario de la demo lo tiene) |
| `E2E_NO_COMMERCIAL_EMAIL` | `sin.comercial@e2e.invalid` (por defecto del script; lo imprime `activate`) |

Pasos (Git Bash, desde la raíz):

1. Pasos 1–3 de «E2E de Clientes» (`prepare`, backend, Vite). Si otra sesión usa ya
   `integration_e2e`, 3100 o 5180, elige otro esquema (`E2E_SCHEMA=integration_e2e_<sufijo>`)
   y otros puertos, y ajusta `API_PORT`, `CORS_ALLOWED_ORIGINS`, `DEV_API_PROXY_TARGET`,
   `E2E_API_URL` y `E2E_BASE_URL`.
2. Con `E2E_NO_COMMERCIAL_PASSWORD` ya exportada,
   `cd backend && E2E_API_URL=http://localhost:3100 pnpm exec ts-node --transpile-only scripts/e2e-stack.ts activate`
   y exporta las líneas `E2E_*` que imprime. Es idempotente: repone el rol y la contraseña
   del usuario sin permisos comerciales.
3. `E2E_BASE_URL=http://localhost:5180 pnpm --filter @app/frontend test:e2e dashboard`
   con esas variables y `E2E_ASESOR_PASSWORD`, `E2E_MANAGER_PASSWORD` y
   `E2E_NO_COMMERCIAL_PASSWORD`.
4. Limpieza: paso 6 de «E2E de Clientes» (detén solo tu backend y tu Vite,
   `e2e-stack.ts drop` con el mismo `E2E_SCHEMA`, borra la carpeta temporal de adjuntos y
   `frontend/test-results`).

Notas:

- **Límite de login:** cada ejecución hace 3 inicios de sesión (el asesor comparte una
  sesión entre sus dos recorridos) y `activate` hasta 6; deja pasar un minuto entre
  `activate` y la ejecución.
- Las aserciones comparan la cifra de cada tarjeta con la respuesta de la API. Antes de
  registrar las esperas de respuesta, el recorrido espera a que termine la carga anterior
  (`networkidle`): una respuesta capturada justo antes de `page.goto` pierde su cuerpo.
- Sin `E2E_NO_COMMERCIAL_PASSWORD` el recorrido del rol `usuario` se salta.
- Si la demo dejara de tener oportunidades abiertas o proyectos activos del asesor, o
  actividades vencidas y alertas de proyecto u oportunidad en el equipo del manager, el
  recorrido falla con un mensaje de precondición: depende de los datos demo.

## 9. En el pipeline

`lint → typecheck → unit → integration → build → security checks`.
Un test rojo detiene el PR. No hay reintentos automáticos que oculten flakiness:
un test inestable se arregla o se retira con issue asociado.
