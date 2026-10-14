# ADR-026 - Runtime de QA: Windows Server nativo con NGINX y servicios de Windows

## Status

Accepted — 2026-10-14

## Context

ADR-012 deja fuera de los pipelines el despliegue: el runtime de cada entorno se
decide en un ADR propio. El primer entorno fuera de las máquinas de desarrollo es
QA y la infraestructura disponible condiciona la decisión:

- Un **Windows Server** propio de QA, sin Docker. Docker en Windows Server no
  ejecuta las imágenes Linux del proyecto (`node:22-alpine`, `nginx:1.27-alpine`)
  sin una capa de virtualización adicional que el servidor no tiene.
- **PostgreSQL en el mismo servidor**, no un servicio gestionado (lo que
  `docs/deployment/environments.md` prevé a largo plazo).
- Acceso por **IP** al principio; un dominio de QA después, imprescindible para
  integrar Entra ID (ADR-007), que no admite direcciones de redirección por IP.
- Autenticación **local** (ADR-019) en esta primera puesta en marcha.

Al preparar QA aparecieron defectos en el camino de contenedores que nunca se
habían ejecutado: las imágenes ya no se construían (el corepack de Node 22.12 no
verifica las firmas actuales de npm al descargar pnpm), la imagen del backend
copiaba los enlaces de `node_modules` del workspace sin su destino, el arranque
apuntaba a `dist/main.js` (el build genera
`dist/src/main.js`), la imagen de producción no puede migrar ni sembrar porque
`pnpm prune --prod` elimina `prisma` y `ts-node`, y NGINX limitaba a 10 MB la
subida de la carga masiva (06). Además, fuera de desarrollo la cookie de sesión
es `Secure`: sobre HTTP el navegador la descarta y la sesión no sobrevive a una
recarga.

## Decision

**QA se ejecuta de forma nativa en Windows Server: el backend como servicio de
Windows (Node 22 vía NSSM), el frontend como build estático servido por NGINX
for Windows con HTTPS, que también hace de proxy de `/api`, y PostgreSQL 18 en
la misma máquina con una base y un usuario propios de la aplicación.**

- Se compila en el servidor desde el clon de `main`
  (`infrastructure/qa-windows/actualizar.ps1`): `pnpm install --frozen-lockfile`,
  `prisma generate`, `pnpm build`, `prisma migrate deploy` y la semilla esencial.
- La configuración versionada vive en `infrastructure/qa-windows/`: `nginx.conf`
  (mismas reglas que la de Docker: cabeceras de seguridad, correlation ID,
  límites, Swagger cerrado), `env.qa.example` (sin valores reales) y los
  scripts de actualización y respaldo. El `.env` real solo existe en el servidor.
- HTTPS siempre, también por IP: certificado de la CA interna o autofirmado
  para la IP; el puerto 80 solo redirige. Solo se exponen 80 y 443; el backend
  (3000) y PostgreSQL (5432) escuchan en `localhost`.
- PostgreSQL 18, la versión de los entornos de desarrollo, para poder restaurar
  en QA un respaldo hecho en desarrollo.
- Runbook: `docs/deployment/qa-windows.md`.

## Alternatives

- **Docker Compose en el servidor (ADR-010)**: paridad con las imágenes, pero
  exige un host Linux o virtualización en el Windows Server que hoy no existe, y
  las imágenes aún no pueden migrar ni sembrar. Queda como camino para
  producción, previo arreglo de la imagen y su propio ADR.
- **IIS con URL Rewrite y ARR** en lugar de NGINX: nativo de Windows, pero
  duplicaría en otra sintaxis las reglas de `infrastructure/nginx` (cabeceras,
  límites, correlation ID) y divergiría de ADR-011.
- **Ejecutar el backend con `NODE_ENV=development` sobre HTTP**: evita el
  certificado, pero activa comportamientos de desarrollo y deja la sesión sin
  la cookie `Secure`. Descartado.
- **Azure App Service / Azure Database for PostgreSQL**: el destino previsto a
  largo plazo, pero no está disponible para QA hoy.

## Consequences

- QA se levanta con la infraestructura existente y se actualiza con un script.
- QA no ejecuta las imágenes que construyen los pipelines: un defecto que solo
  exista en la imagen no se verá en QA. Los encontrados se corrigen (Node 22.20
  en las imágenes, `pnpm deploy --prod` para el `node_modules` del backend,
  `dist/src/main.js` en `start:prod` y en el `CMD`) o quedan registrados
  (migrar y sembrar desde la imagen) para cuando se decida el runtime de
  producción.
- Compilar en el servidor necesita Git, Node y pnpm allí, y acceso de lectura al
  repositorio.
- El certificado autofirmado muestra un aviso en el navegador hasta tener el
  dominio de QA con un certificado válido, que además es requisito de Entra ID.
- La operación (respaldos coordinados de base y adjuntos, purga diaria de la
  carga masiva, actualizaciones) se programa en el Programador de tareas.

## Security Considerations

- Secretos solo en `backend\.env` del servidor, con permisos restringidos a los
  administradores y a la cuenta del servicio; nunca en Git (`env.qa.example`
  solo tiene marcadores).
- La aplicación usa un usuario de PostgreSQL dueño de su base y nada más, con
  `REVOKE CONNECT ... FROM PUBLIC`; nunca `postgres`.
- TLS 1.2+ en NGINX; cookie de sesión `Secure`, `HttpOnly`, `SameSite=Lax`;
  `trust proxy` de un solo salto con `X-Forwarded-For` sobrescrito en el borde.
- Backend, PostgreSQL y adjuntos no son accesibles desde la red: solo NGINX en
  80/443. Swagger cerrado (`SWAGGER_ENABLED=false` y `404` en `/api/docs`).
- Restaurar en QA un respaldo de desarrollo copia usuarios y contraseñas de esa
  base: solo con datos de prueba y cambiando después las credenciales que se
  conserven.
