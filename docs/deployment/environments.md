# Entornos y base de datos

## Modelo

**Una instancia de PostgreSQL por entorno, compartida por todas las
aplicaciones, con una base y un usuario por aplicación.**

| Entorno | Instancia | Quién la administra |
|---|---|---|
| Local | Contenedor compartido en `infrastructure/dev-infra/` | Cada desarrollador en su máquina |
| QA | Servidor gestionado (Azure Database for PostgreSQL) | Plataforma |
| Producción | Servidor gestionado, separado del de QA | Plataforma |

Lo que se comparte es el **servidor**, no los datos: cada aplicación tiene su
base y su usuario, y ese usuario no puede ver las bases de las demás.

### Por qué compartir el servidor

Un servidor que respaldar, parchear, monitorizar y dimensionar, en vez de uno
por aplicación. Para una cartera de aplicaciones internas, el ahorro de
operación es real y el aislamiento por base es suficiente.

### Por qué no compartir también la base

Una base por aplicación da aislamiento de permisos, migraciones independientes
(cada proyecto aplica las suyas sin coordinar despliegues), copias y
restauraciones por aplicación, y la posibilidad de mover una aplicación a su
propio servidor sin tocar su código: solo cambia `DATABASE_URL`.

## Convención de nombres

`snake_case` del nombre del proyecto, idéntico para base y usuario:

| Proyecto | Base | Usuario |
|---|---|---|
| Mi Cliente AG | `mi_cliente_ag` | `mi_cliente_ag` |
| Portal de Proveedores | `portal_proveedores` | `portal_proveedores` |

Sin guiones: obligarían a entrecomillar el identificador en cada sentencia SQL.

En QA y producción, el **usuario lleva el sufijo del entorno**
(`mi_cliente_ag_qa`, `mi_cliente_ag_prod`) con contraseñas distintas, para que
una credencial filtrada de QA no abra producción.

## Permisos

La aplicación se conecta con un usuario que es **dueño de su base y de nada
más**. Nunca con el superusuario.

```sql
CREATE USER mi_cliente_ag_qa WITH PASSWORD '<del almacen de secretos>';
CREATE DATABASE mi_cliente_ag OWNER mi_cliente_ag_qa;
REVOKE CONNECT ON DATABASE mi_cliente_ag FROM PUBLIC;
```

El `REVOKE` importa más de lo que parece: por defecto, **cualquier usuario del
servidor puede conectarse a cualquier base**. Sin él, el aislamiento entre
aplicaciones es una convención, no un control.

Las migraciones de Prisma se ejecutan con ese mismo usuario, que es dueño de la
base y por tanto puede crear y alterar tablas. No hace falta un usuario
privilegiado aparte, salvo para la bitácora de auditoría en QA y producción
(siguiente apartado).

### Bitácora de auditoría (`audit_logs`)

La migración `20261014100000_audit_logs_append_only` protege `audit_logs` con
disparadores: la base rechaza `UPDATE` y `TRUNCATE` siempre y `DELETE` dentro de
`auditoria.dias_retencion` ([ADR-025](../adr/ADR-025-inmutabilidad-de-la-auditoria-con-disparadores.md),
[`data-model.md`](../database/data-model.md) §6). Los disparadores bastan contra
errores de la aplicación, pero **el propietario de la tabla o un superusuario
puede desactivarlos** (`ALTER TABLE … DISABLE TRIGGER`). Por eso, en QA y
producción se recomienda separar tres roles:

| Rol | Para qué | Sobre `audit_logs` |
|---|---|---|
| Migraciones (propietario de los objetos) | `prisma migrate deploy` desde el pipeline | Dueño; nunca lo usa la aplicación en ejecución |
| `<rol_app>` (`mi_cliente_ag_qa`, `…_prod`) | La aplicación en ejecución | Solo `SELECT` e `INSERT` |
| `<rol_purga>` | Purga periódica de lo vencido | `SELECT` y `DELETE` (el disparador sigue impidiendo borrar dentro de la retención) |

```sql
-- 1. Nadie hereda privilegios sobre la bitácora: ni PUBLIC ni la aplicación.
REVOKE ALL ON audit_logs FROM PUBLIC, <rol_app>;
-- 2. Lo justo para cada rol.
GRANT SELECT, INSERT ON audit_logs TO <rol_app>;
GRANT SELECT, DELETE ON audit_logs TO <rol_purga>;
-- 3. La función del disparador es SECURITY INVOKER: corre con los privilegios de
--    quien borra y lee la retención (auditoria.dias_retencion) de system_parameters.
--    Sin este permiso, la purga falla en el disparador.
GRANT SELECT ON system_parameters TO <rol_purga>;
```

`REVOKE ALL … FROM PUBLIC, <rol_app>` (y no solo `UPDATE, DELETE, TRUNCATE`)
quita también `REFERENCES`, `TRIGGER` y cualquier privilegio heredado de
`PUBLIC`; después se conceden explícitamente los que cada rol necesita.

**Privilegios por defecto del rol de migraciones.** Para que la aplicación pueda
usar las tablas nuevas que creen las migraciones, el rol de migraciones suele
llevar privilegios por defecto. Deben ser **acotados** (nunca `ALL`, que incluye
`TRUNCATE`, `REFERENCES` y `TRIGGER`):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE <rol_migraciones> IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <rol_app>;
ALTER DEFAULT PRIVILEGES FOR ROLE <rol_migraciones> IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO <rol_app>;
```

Esos privilegios por defecto se aplican a **toda** tabla nueva, también a
`audit_logs` si una migración la recrea: tras cualquier migración que cree o
recree `audit_logs`, vuelve a ejecutar el bloque anterior (`REVOKE ALL` +
`GRANT`). Compruébalo con `\dp audit_logs` en `psql`: `<rol_app>` solo debe
tener `ar` (`SELECT`, `INSERT`) y `<rol_purga>`, `rd` (`SELECT`, `DELETE`).

Es decir: la aplicación **no** debe ser propietaria de `audit_logs`; las
migraciones se ejecutan con otro rol y la purga con uno propio. Si el entorno
mantiene un único usuario dueño de la base (como en local), los disparadores
siguen protegiendo, pero esa credencial podría desactivarlos. Desactivar un
disparador queda en los logs de PostgreSQL.

## Credenciales

| Entorno | De dónde salen |
|---|---|
| Local | `.env`, que no se versiona. Contraseña = nombre de usuario; el servicio solo escucha en `localhost` y no hay datos reales |
| QA y producción | Almacén de secretos de la plataforma (Azure Key Vault), inyectadas como variables de entorno |

Nunca una contraseña real en Git, ni siquiera de QA. Un secreto en el historial
no se arregla borrando el archivo: hay que rotarlo.

## Conexiones

PostgreSQL gestiona cada conexión con un proceso, así que una instancia
compartida se queda sin conexiones antes que sin CPU. Con varias aplicaciones y
varias réplicas de cada una, conviene:

- Limitar el pool por aplicación en la cadena de conexión:
  `?connection_limit=10&pool_timeout=20`
- Vigilar `max_connections` del servidor frente a la suma de los pools.
- Si el servidor gestionado ofrece PgBouncer, usarlo. Con Prisma hace falta
  añadir `?pgbouncer=true`.

Es la contrapartida de compartir servidor, y es manejable, pero hay que
mirarla: no se descubre sola hasta que un despliegue agota las conexiones de
todos a la vez.

## Local: cómo trabajar

```bash
# 1. Levantar la instancia compartida (una vez por máquina)
cd ~/dev-infra && docker compose up -d

# 2. Dar de alta el proyecto (una vez por proyecto)
docker compose exec postgres psql -U postgres \
  -c "CREATE USER mi_cliente_ag WITH PASSWORD 'mi_cliente_ag';" \
  -c "CREATE DATABASE mi_cliente_ag OWNER mi_cliente_ag;"

# 3. En el proyecto: .env y backend/.env
# DATABASE_URL=postgresql://mi_cliente_ag:mi_cliente_ag@localhost:5433/mi_cliente_ag?schema=public

# 4. Migrar y sembrar
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed
```

Detalle en [`infrastructure/dev-infra/README.md`](../../infrastructure/dev-infra/README.md).

### Base dedicada para un proyecto concreto

El `docker-compose.yml` de cada proyecto trae un servicio `postgres` bajo el
perfil `local-db`, apagado por defecto:

```bash
docker compose --profile local-db up -d postgres
```

Úsalo solo con motivo (una versión distinta de PostgreSQL, una prueba
destructiva): te separa del modelo de los entornos de arriba.

## Borde, proxies y exposición a internet

Configuración que cada entorno debe fijar al desplegar desde la rama
`feature/endurecimiento-internet` ([plan de exposición a internet](../security/plan-exposicion-internet.md)
§2; diseño del borde en el addendum 2026-10-20 de [ADR-011](../adr/ADR-011-nginx.md)).

### Variables de la API

| Variable | Regla |
|---|---|
| `TRUST_PROXY_HOPS` | Entero ≥ 0, por defecto `1`. Saltos de proxy delante de la API cuyo `X-Forwarded-For` se acepta (IP real del cliente para el límite de peticiones y los registros). `1` = solo NGINX (Compose y QA hoy); `2` = WAF, Front Door o balanceador delante de NGINX; `0` = sin proxy. **Nunca más que los saltos reales**: un valor mayor permite al cliente falsear su IP. Con un ingress delante hay que declarar además sus rangos en el `geo $from_trusted_ingress` de `infrastructure/nginx/nginx.conf` |
| `CORS_ALLOWED_ORIGINS` | Con `NODE_ENV=production` solo orígenes `https://` exactos, separados por coma (sin `*`, sin ruta, sin barra final; con puerto si no es el 443), o vacío si la SPA y la API comparten origen detrás de NGINX. Cualquier otro valor impide arrancar la API. En `docker-compose.yml` el valor por defecto es vacío. Sin la variable, el valor por defecto es de desarrollo (`http://`) y en producción tampoco arranca |

### HSTS

Solo en producción, con dominio propio y certificado de una CA pública. Lo decide el `map`
`$hsts_header` de cada `nginx.conf`: vacío (no se envía) en Docker y en QA. Para activarlo en
producción se descomenta la línea de un año (`max-age=31536000; includeSubDomains`) de
`infrastructure/nginx/nginx.conf`; si hay dudas, se empieza con un `max-age` corto. Un `max-age`
erróneo es difícil de deshacer y `preload` es una decisión aparte.

### Imágenes base fijadas por digest

Las imágenes base se fijan por **etiqueta y digest**; con ambos, Docker descarga el digest e ignora
la etiqueta. Los Dockerfile instalan siempre con `--frozen-lockfile`, sin respaldo: un lockfile
desactualizado rompe la construcción, como en CI.

| Imagen | Dónde |
|---|---|
| `node:22.20.0-alpine@sha256:dbcedd8a…` | `ARG NODE_DIGEST` de `backend/Dockerfile` y `frontend/Dockerfile` |
| `nginx:1.27-alpine@sha256:65645c7b…` | `ARG NGINX_DIGEST` de `frontend/Dockerfile` y `image` del servicio `nginx` en `docker-compose.yml` (deben coincidir) |

Al cambiar de versión se actualizan **la etiqueta y el digest** en todos los sitios de la tabla. El
digest es el del índice multiarquitectura de esa etiqueta: `docker buildx imagetools inspect
node:<versión>-alpine` (línea `Digest:`) o, sin Docker, el campo `digest` de
`https://hub.docker.com/v2/repositories/library/<imagen>/tags/<etiqueta>`. El procedimiento está
también comentado en los Dockerfile.

### Mapas de código fuente del frontend

El build de producción no genera `.map` y NGINX responde `404` a `*.map`. Si una herramienta de
monitorización de errores los necesita, se compila con la variable de entorno
`FRONTEND_BUILD_SOURCEMAP=hidden` (`FRONTEND_BUILD_SOURCEMAP=hidden pnpm build`): genera los `.map`
sin la referencia `sourceMappingURL` en los bundles, y el pipeline debe subirlos a esa herramienta y
**borrarlos de `dist`** antes de empaquetar. No es un `ARG` de `frontend/Dockerfile`; apagada por
defecto.

### Despliegue conjunto de backend y frontend

El backend exige `X-Requested-With: XMLHttpRequest` en `POST /auth/refresh` y `POST /auth/logout`, y
solo el frontend de esta versión la envía: **se despliegan juntos**. Con un frontend anterior la
sesión no se renueva y cada usuario tendría que volver a entrar al caducar el access token. Además,
al cambiar el nombre de la cookie a `__Secure-refresh_token`, las sesiones locales vigentes se
pierden **una vez** ([`AUTHENTICATION.md`](../../AUTHENTICATION.md) §3).

### Comprobaciones tras actualizar el borde

Sustituir `<host>` por el nombre del entorno (`-k` solo con certificado autofirmado o interno).

| Comprobación | Resultado esperado |
|---|---|
| `nginx -t` (en QA, el comando del paso 9 de [`qa-windows.md`](qa-windows.md)) | Sintaxis correcta |
| `curl -skI https://<host>/` | Una sola cabecera de cada tipo; `Content-Security-Policy` con `'nonce-…'`; `Cache-Control: no-store` |
| `curl -sk https://<host>/ \| grep csp-nonce` | El `content` del meta es el mismo nonce que el de la cabecera CSP de esa respuesta (dos peticiones dan nonces distintos) |
| `curl -skI https://<host>/api/v1/health` | Una sola cabecera de cada tipo (sin las de helmet duplicadas); sin HSTS salvo en producción |
| `curl -sk -X TRACE https://<host>/` | `405` |
| `curl -sk -o /dev/null -w '%{http_code}' https://<host>/assets/x.js.map` | `404` |
| `curl -sk https://<host>/api/v1/ready` | `{"status":"ready","timestamp":"…"}` |
| Construcción de imágenes (`docker compose build`) | Termina sin resolver dependencias fuera del lockfile |

## Despliegue

Los pipelines construyen y verifican imágenes, pero **no despliegan**: el
runtime de destino es una decisión de cada proyecto que necesita su propio ADR
(ADR-012). Cuando se decida, `DATABASE_URL` se inyecta desde el almacén de
secretos del entorno y nada más cambia en la aplicación.
