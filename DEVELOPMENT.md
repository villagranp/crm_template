# DEVELOPMENT.md

Cómo levantar y trabajar en este template.

## 1. Requisitos

### Imprescindibles

| Herramienta | Versión | Por qué |
|---|---|---|
| Node.js | 22 LTS (ver `.nvmrc`) | Runtime de ambos workspaces. `engines` exige `>=22` |
| pnpm | 9.12.0 (`corepack enable`) | Gestor del monorepo. No se instala con `npm i -g pnpm`: viene con Node vía corepack |
| Docker + Compose v2 | reciente | PostgreSQL local, NGINX y las imágenes de despliegue |
| Git | 2.30+ | `.gitattributes` y firma de commits |

### Según lo que vayas a hacer

| Herramienta | Cuándo hace falta |
|---|---|
| Navegadores de Playwright | Antes del primer `pnpm test:e2e`: `pnpm --filter @app/frontend exec playwright install --with-deps chromium` |
| `psql` o un cliente SQL | Opcional: `prisma:studio` cubre la inspección diaria |
| Azure CLI | Opcional, sólo si creas repos o pipelines desde la terminal |

### Comprobación rápida

```bash
node -v      # v22.x
pnpm -v      # 9.12.0
docker -v && docker compose version
git --version
```

Si `pnpm` no existe: `corepack enable && corepack prepare pnpm@9.12.0 --activate`.

En Windows, trabaja dentro de **WSL2** (Ubuntu) con Docker Desktop apuntando a
WSL. Los scripts de `infrastructure/scripts/` son Bash y los contenedores son
Linux: fuera de WSL el entorno funciona a medias y falla de formas difíciles de
diagnosticar.

## 2. Primer arranque

```bash
corepack enable
pnpm install
cp .env.example .env                              # completar valores locales
# Base de datos: instancia compartida (una vez por maquina)
docker compose -f infrastructure/dev-infra/docker-compose.yml up -d
cp backend/.env.example backend/.env              # la CLI de Prisma solo lee este
pnpm --filter @app/backend run prisma:generate
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed        # semilla esencial: accesos, admin y configuración del CRM
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs (solo si `SWAGGER_ENABLED=true`)
- Stack completo tras NGINX: `docker compose up -d` → http://localhost

## 3. Scripts del workspace

| Comando | Qué hace |
|---|---|
| `pnpm dev` | frontend + backend en watch |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | unit tests |
| `pnpm test:e2e` | E2E |
| `pnpm build` | build de producción |
| `pnpm verify` | lint + typecheck + test + build (lo mismo que el PR pipeline) |

## 4. Variables de entorno

Toda variable nueva se agrega a `.env.example` **y** al esquema de validación
(`backend/src/config/env.schema.ts` o `frontend/src/config/env.ts`).
La aplicación falla al arrancar si falta una variable obligatoria: eso es intencional.

En el frontend solo `VITE_*`, y solo valores públicos: el bundle es visible para cualquiera.

### 4.1 Almacenamiento de adjuntos (`ATTACHMENTS_STORAGE_PATH`, ADR-021)

Los binarios de los adjuntos del CRM se guardan en disco, detrás del puerto
`FileStorage` (`backend/src/infrastructure/storage/`). La base solo guarda sus
metadatos (`stored_files`, `attachments`).

| Entorno | Valor | Notas |
|---|---|---|
| Local (`pnpm dev`) | `./storage/attachments` (por defecto) | Relativo al directorio del backend: `backend/storage/attachments`, ignorado por Git |
| Docker Compose | `/app/storage/attachments` | Volumen con nombre `attachments-data`; la imagen crea el punto de montaje con dueño `node` |
| Servidor | Ruta del volumen montado | El volumen apunta al almacenamiento definitivo; el usuario `node` del contenedor necesita lectura y escritura. Respaldo coordinado con el de PostgreSQL |
| Pruebas de integración | Directorio temporal por esquema | Lo fija `backend/test/setup-env.ts`; nunca la carpeta de desarrollo |

- Al arrancar, la API crea la ruta si no existe; si no puede crearla o no es
  escribible, **no arranca** (mensaje `ATTACHMENTS_STORAGE_PATH is not a usable writable directory`).
- Dentro de la ruta: `<año>/<mes>/<uuid>` (clave generada por el servidor) y
  `.tmp/` (escrituras en curso; un `.part` antiguo es un resto de un proceso
  interrumpido y puede borrarse con la API parada).
- **Nunca** se sirve como estático (ni NGINX ni `express.static`): los adjuntos se
  descargan por la API tras autorizar. Varias réplicas de la API deben montar el
  mismo almacenamiento compartido.

## 5. Base de datos

```bash
pnpm --filter @app/backend run prisma:migrate    # crear/aplicar migración en dev
pnpm --filter @app/backend run prisma:studio     # inspección
pnpm --filter @app/backend run prisma:generate   # regenerar cliente
pnpm --filter @app/backend run prisma:seed       # semilla esencial (idempotente, todos los entornos)
pnpm --filter @app/backend run prisma:seed:demo  # semilla de demostración (solo desarrollo/QA, ver §5.1)
```

### 5.1 Semillas: esencial y de demostración

| | Esencial | Demostración |
|---|---|---|
| Entrada | `backend/prisma/seed.ts` (+ `prisma/seed/*.ts`) | `backend/prisma/seed-demo.ts` (+ `prisma/seed/demo/*.ts`) |
| Comando | `prisma:seed` (lo ejecuta el despliegue) | `prisma:seed:demo` (manual; nunca en pipeline ni en el contenedor) |
| Entornos | Todos, producción incluida | Solo desarrollo y QA |
| Contenido | Módulos, permisos, roles (incl. `asesor`, `manager`, `responsable-pais`), administrador, monedas, 6 países, unidades, conversiones genéricas, secuencias, 17 catálogos `crm.*`, parámetros `crm.*` | Equipos y usuarios `@demo.invalid`, clientes, contactos, proyectos, oportunidades, productos, forecast, visitas, actividades, una importación, tipos de cambio y metas ficticios |

**Esencial.** Idempotente (`upsert` por clave natural). No pisa lo que un
administrador ajustó: valores de parámetros, etiquetas/orden/`metadata`/estado
de los elementos de catálogo, `currentValue` de las secuencias, unidades,
factores de conversión ni tipos de cambio. Sí repone las asignaciones de los
roles de sistema. Las opciones de menú del CRM están declaradas, pero solo se
crean cuando su ruta está en `app-routes.registry.json` (DM-32): cada módulo, al
entregar su pantalla, registra la ruta y vuelve a ejecutar la semilla. Los tipos
de cambio iniciales (`prisma/seed/crm-exchange-rates.ts`) están vacíos hasta que
el negocio entregue los valores.

**Demostración.** Se niega (código 1, sin escribir nada) salvo que se cumplan
las tres condiciones:

1. `NODE_ENV` distinto de `production`;
2. `SEED_DEMO=true` en el entorno;
3. el parámetro `sistema.permite_datos_demo` vale `true` en esa base (la esencial
   lo crea en `false`; actívalo en Administración → Parámetros).

```bash
# después de prisma:seed y de activar sistema.permite_datos_demo
SEED_DEMO=true pnpm --filter @app/backend run prisma:seed:demo
SEED_DEMO=true pnpm --filter @app/backend run prisma:seed:demo -- --purge   # borra solo lo marcado DEMO
```

Contraseña de los usuarios demo: **solo** `SEED_DEMO_PASSWORD` (en tu `.env`, nunca
en el repositorio), con cambio obligatorio en el primer acceso. No se usa
`AUTH_DEFAULT_PASSWORD`: sin `SEED_DEMO_PASSWORD` las cuentas demo quedan
`INVITED` sin credencial (si la defines después y vuelves a sembrar, se crea la
credencial; nunca se pisa una existente). Todo dato demo está marcado (códigos
`DEMO-…`, correos `@demo.invalid`, `[DEMO]` en reglas y metas, fuente `DEMO …` en
tipos de cambio) y no consume las secuencias reales. Re-ejecutarla no duplica:
equipos, usuarios y maestros se actualizan; los datos comerciales demo se recrean
con fechas relativas a hoy (forecast M+1…M+6, vencidas, próximas).

- **`crm.importaciones.habilitada`** (06 D-06.9): la demo lo pone en `true` solo si
  tenía otro valor, y deja en la bitácora un `parameter.updated` sin actor
  (`correlationId = seed-demo`, `metadata.source = demo-seed`). `--purge` **no** lo
  revierte: vuelve a `false` a mano en Administración → Parámetros si hace falta.
- **`--purge`** borra solo lo marcado demo. Si un registro que **no** es de la demo
  referencia a un usuario `@demo.invalid` (p. ej. un cliente real con un asesor
  demo como responsable), se niega con código 1, no borra nada y lista las tablas
  y columnas afectadas con su conteo (sin datos personales). Reasigna o elimina
  esos registros y repite.
- **Adjuntos demo** (00 §8.3): aplazados hasta que existan el adaptador
  `FileStorage` y `ATTACHMENTS_STORAGE_PATH` (Módulo 2, ADR-021).

Ninguna tabla se crea a mano. Toda migración es reversible o documenta su irreversibilidad.

## 6. Flujo de trabajo diario

1. Toma el requerimiento → Skill `requirements-analysis`.
2. Escribe la user story en `docs/user-stories/` → Skill `user-story`.
3. Valida la Definition of Ready.
4. Crea el implementation plan en `docs/implementation-plans/`.
5. Implementa siguiendo `feature-development`.
6. `pnpm verify`.
7. Actualiza documentación y OpenAPI.
8. Abre el PR con la plantilla de `CONTRIBUTING.md`.

## 7. Problemas frecuentes

| Síntoma | Causa habitual |
|---|---|
| La API no arranca y menciona configuración | Falta una variable en `.env` (fail fast intencional) |
| `401` en todas las llamadas locales | `AUTH_PROVIDER` sin configurar o token expirado |
| CORS bloqueado | Origen no incluido en `CORS_ALLOWED_ORIGINS` |
| Prisma no encuentra el cliente | Falta `prisma:generate` tras cambiar el schema |
| Puerto ocupado | Otro stack corriendo: `docker compose down` |

---

## Problemas frecuentes al arrancar

### `P1000: Authentication failed` contra la base de datos

Suele significar que **no estás hablando con el contenedor**: hay otro
PostgreSQL escuchando en el puerto al que apunta tu `DATABASE_URL`.

La instancia compartida se publica en el **5433** del host justamente para
evitar chocar con un PostgreSQL instalado en la máquina, que suele estar en el
5432. Ver [`docs/deployment/environments.md`](docs/deployment/environments.md).

```bash
# ¿El contenedor acepta las credenciales por dentro?
docker compose exec postgres psql -U app -d app -c "select current_user;"
```

Si eso funciona, mueve el contenedor a otro puerto sin tocar archivos
versionados: pon `POSTGRES_PORT` en tu `.env` y ajusta el puerto de
`DATABASE_URL` en `.env` **y** en `backend/.env`.

### `Environment variable not found: DATABASE_URL`

La CLI de Prisma se ejecuta con el directorio de trabajo en `backend/` y solo
lee `backend/.env`; no sube un nivel como sí hace NestJS. Copia también ese
archivo: `cp backend/.env.example backend/.env`.

Verifica siempre contra qué base vas a migrar: `prisma migrate dev` imprime
`Datasource "db": ... at "localhost:XXXX"` antes de hacer nada.
