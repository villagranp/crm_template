# QA en Windows Server (runbook)

Decisión: [ADR-026](../adr/ADR-026-runtime-de-qa-en-windows-server-nativo.md). Archivos
versionados: [`infrastructure/qa-windows/`](../../infrastructure/qa-windows/).

```text
Navegador ──HTTPS 443──► NGINX for Windows (frontend estático + proxy de /api)
                              └──► backend Node, 127.0.0.1:3000 (servicio MiClienteAG-API)
                                        └──► PostgreSQL 18, localhost:5432
```

Solo 443 y 8080 (redirige a HTTPS) quedan abiertos; el 80 es de IIS, que el servidor ya tenía y no se toca. Todos los comandos son de **PowerShell como
administrador** en el servidor, salvo los marcados como «en tu equipo».

## Convenciones

| Qué | Dónde |
|---|---|
| Clon del repositorio | `C:\apps\mi-cliente-ag` |
| Configuración con secretos | `C:\apps\mi-cliente-ag\backend\.env` (no versionado) |
| Adjuntos, logs y respaldos | `C:\data\mi-cliente-ag\{attachments,logs,backups}` |
| NGINX | `C:\nginx` (certificado en `C:\nginx\ssl`) |
| Servicios de Windows | `MiClienteAG-API`, `MiClienteAG-NGINX` |
| Base / usuario | `mi_cliente_ag` / `mi_cliente_ag_qa` |

Si alguna ruta cambia, se cambia también en `nginx.conf` y en los parámetros de los
scripts.

## 1. Software base

| Componente | Versión | Fuente |
|---|---|---|
| Git for Windows | actual | git-scm.com (trae `openssl.exe`) |
| Node.js | **22 LTS, 22.14 o superior** | nodejs.org, instalador MSI (incluye corepack; las versiones anteriores traen claves de firma caducadas y `corepack` no puede descargar pnpm) |
| PostgreSQL | **18** (la de desarrollo) | instalador de EDB; anota la contraseña de `postgres` |
| NGINX for Windows | 1.27.x | nginx.org, descomprimir en `C:\nginx` |
| NSSM | 2.24 | nssm.cc, `nssm.exe` (win64) en `C:\nssm` y en el `PATH` |

```powershell
corepack enable
# Rutas largas de node_modules
New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
git config --global core.longpaths true
# Los archivos quedan como en el repositorio (LF): las migraciones se verifican por su contenido.
git config --global core.autocrlf false
New-Item -ItemType Directory -Force C:\apps, C:\data\mi-cliente-ag\attachments, C:\data\mi-cliente-ag\logs, C:\data\mi-cliente-ag\backups, C:\nginx\ssl
```

Cierra y abre PowerShell para que el `PATH` incluya Node, pnpm y Git.

## 2. PostgreSQL

1. En `C:\Program Files\PostgreSQL\18\data\postgresql.conf`: `listen_addresses = 'localhost'`.
   Reinicia el servicio `postgresql-x64-18`.
2. Crea el usuario y la base (`psql` pide la contraseña de `postgres`):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost
```

```sql
CREATE USER mi_cliente_ag_qa WITH PASSWORD '<contraseña fuerte>';
CREATE DATABASE mi_cliente_ag OWNER mi_cliente_ag_qa;
REVOKE CONNECT ON DATABASE mi_cliente_ag FROM PUBLIC;
\q
```

La aplicación usa siempre `mi_cliente_ag_qa`, nunca `postgres`
([environments.md](environments.md)). Las migraciones no crean extensiones: ese usuario basta.

> **Riesgo aceptado y temporal de QA (decisión del responsable 2026-10-14, D3).**
> `mi_cliente_ag_qa` es a la vez dueño de la base, rol de migraciones y aplicación, así que es
> propietario de `audit_logs` y **podría desactivar sus disparadores de inmutabilidad**
> ([ADR-025](../adr/ADR-025-inmutabilidad-de-la-auditoria-con-disparadores.md)). En QA se acepta
> sin cambiar los scripts: no hay datos productivos y desactivar un disparador queda en los logs
> de PostgreSQL. **Producción no hereda esta configuración**: separa migraciones, aplicación y
> purga como indica [environments.md](environments.md) ("Bitácora de auditoría").

## 3. Código

```powershell
cd C:\apps
git clone <URL SSH o HTTPS del repo en Azure DevOps> mi-cliente-ag
cd mi-cliente-ag
git checkout main
```

Con HTTPS usa un PAT de solo lectura (`Code: Read`); con SSH, una clave del servidor dada de
alta en Azure DevOps.

## 4. Configuración

```powershell
Copy-Item C:\apps\mi-cliente-ag\infrastructure\qa-windows\env.qa.example C:\apps\mi-cliente-ag\backend\.env
notepad C:\apps\mi-cliente-ag\backend\.env
```

Rellena los `<...>`:

- `DATABASE_URL`: la contraseña del paso 2.
- `JWT_ACCESS_TOKEN_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- `AUTH_DEFAULT_PASSWORD`: 12+ caracteres.
- `CORS_ALLOWED_ORIGINS`: `https://<IP del servidor>`. QA corre con `NODE_ENV=production`, así que solo
  admite orígenes `https://` exactos (sin `*`, ruta ni barra final) o vacío; con otro valor la API no
  arranca ([`environments.md`](environments.md#borde-proxies-y-exposición-a-internet)).
- `TRUST_PROXY_HOPS`: déjalo en `1` (solo NGINX delante). Pasa a `2` únicamente si se pone un WAF o
  Front Door delante de NGINX; nunca más que los saltos reales.

Restringe el archivo a administradores y `SYSTEM` (la cuenta del servicio):

```powershell
icacls C:\apps\mi-cliente-ag\backend\.env /inheritance:r /grant:r "Administrators:F" "SYSTEM:R"
```

### 4.1 Variables del frontend (solo con Entra ID)

Con `AUTH_PROVIDER=local` no hace falta nada: los valores por defecto del frontend ya son los de
QA. Con Entra ID hay que dar al servidor un segundo archivo, **distinto del `.env` del backend**.

Las variables `VITE_*` **se incrustan en el bundle al compilar** (`pnpm build`): no se leen en
tiempo de ejecución ni del `backend\.env`. Si cambian, hay que volver a compilar. Vite lee, en
modo producción, `frontend\.env.production.local`; `.gitignore` ya ignora `.env.*`, así que ese
archivo vive solo en el servidor, sobrevive a `git pull` y no se versiona (cuidado con
`git clean -x`, que lo borraría). No contienen secretos: son valores públicos que acabarán en el
JavaScript que descarga el navegador.

Créalo **antes** de ejecutar `actualizar.ps1` (o de `pnpm build` en el paso 6), con los valores de
QA. Client ID, authority y scope los entrega el administrador del tenant:

```powershell
notepad C:\apps\mi-cliente-ag\frontend\.env.production.local
```

```dotenv
VITE_AUTH_PROVIDER=entra
VITE_ENTRA_CLIENT_ID=<client ID de la aplicación SPA>
VITE_ENTRA_AUTHORITY=https://login.microsoftonline.com/<ID del tenant>
VITE_ENTRA_REDIRECT_URI=https://miclienteag-qa.somosgrupoag.com/auth/callback
VITE_ENTRA_API_SCOPE=<scope de la API, p. ej. api://<client ID de la API>/access_as_user>
```

- `VITE_ENTRA_AUTHORITY` debe llevar el **GUID del tenant**; `/common`, `/organizations` y
  `/consumers` se rechazan al arrancar (aceptarían cuentas de cualquier tenant).
- `VITE_ENTRA_REDIRECT_URI` debe coincidir **exactamente** con una redirect URI registrada (ver el
  apartado 14).
- Si falta alguna de las cuatro variables `VITE_ENTRA_*` con `VITE_AUTH_PROVIDER=entra`, la página
  queda en blanco y la consola del navegador muestra `Invalid frontend configuration` con el
  nombre de la variable (nunca su valor).
- Plantilla con todas las variables y su explicación: sección «FRONTEND» de `.env.example`.

## 5. (Opcional) Traer la base de desarrollo

Solo si quieres en QA los datos de tu base local. Se copian **también sus usuarios y
contraseñas**: úsalo solo con datos de prueba y cambia después las credenciales que
conserves. Si no, salta al paso 6 y QA nace vacía con la semilla esencial.

**En tu equipo** (PostgreSQL 18, base `mi_cliente_ag`):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -h localhost -U mi_cliente_ag -d mi_cliente_ag -Fc -f "$env:USERPROFILE\Desktop\mi_cliente_ag_local.dump"
```

Copia el `.dump` al servidor (p. ej. a `C:\data\mi-cliente-ag\backups\`) y restáuralo sobre la
base **vacía** del paso 2:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' -h localhost -U mi_cliente_ag_qa -d mi_cliente_ag --no-owner --no-privileges C:\data\mi-cliente-ag\backups\mi_cliente_ag_local.dump
```

`--no-owner --no-privileges` deja todo a nombre de `mi_cliente_ag_qa`, también `audit_logs`
(riesgo aceptado de QA D3, ver el aviso del paso 2). Un aviso sobre el
esquema `public` (p. ej. su comentario) es inocuo; cualquier otro error, se revisa antes de
seguir. La tabla `_prisma_migrations` viaja con los datos: en el paso 6, `migrate deploy` solo
aplicará lo que falte. Si tu base local tuviera adjuntos (`backend\storage\attachments`), copia
esa carpeta a `C:\data\mi-cliente-ag\attachments`.

## 6. Compilar, migrar y sembrar

```powershell
cd C:\apps\mi-cliente-ag
pnpm install --frozen-lockfile
pnpm --filter '@app/backend' exec prisma generate
pnpm build
pnpm --filter '@app/backend' run prisma:deploy
```

Semilla esencial. La primera vez define el administrador inicial (solo en esta sesión de
PowerShell; nunca en el `.env`). Si restauraste tu base, el administrador ya existe y la
semilla no lo toca:

```powershell
$env:SEED_ADMIN_EMAIL = '<correo del administrador de QA>'
$env:SEED_ADMIN_PASSWORD = '<contraseña inicial, 12+>'
pnpm --filter '@app/backend' run prisma:seed
Remove-Item Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD
```

No ejecutes la semilla demo en QA salvo que quieras datos ficticios.

## 7. Backend como servicio

```powershell
nssm install MiClienteAG-API "C:\Program Files\nodejs\node.exe" "dist\src\main.js"
nssm set MiClienteAG-API AppDirectory C:\apps\mi-cliente-ag\backend
nssm set MiClienteAG-API AppStdout C:\data\mi-cliente-ag\logs\api.log
nssm set MiClienteAG-API AppStderr C:\data\mi-cliente-ag\logs\api.log
nssm set MiClienteAG-API AppRotateFiles 1
nssm set MiClienteAG-API AppRotateOnline 1
nssm set MiClienteAG-API AppRotateBytes 10485760
nssm set MiClienteAG-API Start SERVICE_AUTO_START
nssm start MiClienteAG-API
Invoke-RestMethod http://127.0.0.1:3000/api/v1/ready
```

Si no arranca, el motivo está en `C:\data\mi-cliente-ag\logs\api.log` (p. ej.
`Configuracion invalida:` con la variable que falta, nunca su valor).

## 8. Certificado

Con una CA interna, pide un certificado para la IP (y luego para el dominio) y guárdalo como
`C:\nginx\ssl\qa.crt` y `qa.key` (PEM). Si no, uno autofirmado de un año:

```powershell
$env:OPENSSL_CONF = 'C:\Program Files\Git\usr\ssl\openssl.cnf'
& 'C:\Program Files\Git\usr\bin\openssl.exe' req -x509 -newkey rsa:2048 -nodes -days 365 `
  -keyout C:\nginx\ssl\qa.key -out C:\nginx\ssl\qa.crt `
  -subj "/CN=<IP>" -addext "subjectAltName=IP:<IP>"
icacls C:\nginx\ssl\qa.key /inheritance:r /grant:r "Administrators:F" "SYSTEM:R"
```

`OPENSSL_CONF` evita el error `openssl.cnf ... No such file` cuando otro programa (el driver
ODBC de PostgreSQL, por ejemplo) deja esa variable apuntando a un archivo inexistente.

## 9. NGINX como servicio

```powershell
$conf = 'C:\apps\mi-cliente-ag\infrastructure\qa-windows\nginx.conf'
C:\nginx\nginx.exe -p C:\nginx\ -c $conf -t
nssm install MiClienteAG-NGINX C:\nginx\nginx.exe
nssm set MiClienteAG-NGINX AppParameters "-p C:\nginx\ -c $conf"
nssm set MiClienteAG-NGINX AppDirectory C:\nginx
nssm set MiClienteAG-NGINX Start SERVICE_AUTO_START
nssm start MiClienteAG-NGINX

New-NetFirewallRule -DisplayName 'MiClienteAG HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName 'MiClienteAG HTTP'  -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

`nginx.conf` se usa tal cual desde el clon: incluye `security-headers.conf` de
`infrastructure/nginx` y sirve `frontend\dist`. Escribe en `index.html` el nonce de la CSP de cada
respuesta y lo sirve sin caché, responde `405` a métodos fuera de la lista permitida y `404` a
`*.map` (ADR-011, addendum 2026-10-20). **HSTS no se activa en QA** (`map $hsts_header` vacío):
el certificado es autofirmado o interno y la dirección la comparte con IIS; solo en producción
([`environments.md`](environments.md#hsts)).

## 10. Verificación

Desde otro equipo de la red:

1. `http://<IP>:8080/` redirige a `https://<IP>/` (con certificado autofirmado, el navegador avisa
   una vez).
2. `https://<IP>/healthz` → `ok`; `https://<IP>/api/v1/ready` → 200.
3. `https://<IP>/api/docs` → 404.
4. Inicia sesión con el administrador, cambia la contraseña inicial y comprueba el menú.
5. Recarga la página: la sesión se mantiene (cookie `__Secure-refresh_token`, `Secure`, sobre HTTPS).
6. Si se usará la carga masiva: Administración → Parámetros → «Carga masiva habilitada».
7. Comprobaciones del borde (cabeceras únicas, nonce de la CSP, `TRACE` → 405, `*.map` → 404):
   la lista de [`environments.md`](environments.md#comprobaciones-tras-actualizar-el-borde).

## 11. Tareas programadas

Ambas como `SYSTEM`, a diario. La de respaldo necesita la contraseña de `mi_cliente_ag_qa`
en `C:\Windows\System32\config\systemprofile\AppData\Roaming\postgresql\pgpass.conf`
(`localhost:5432:mi_cliente_ag:mi_cliente_ag_qa:<contraseña>`), con permisos solo para
administradores y `SYSTEM`.

```powershell
# Purga de los datos leídos en la carga masiva (06 RN-06.29), 02:00
$purge = New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' -Argument 'dist\src\scripts\purge-customer-import-rows.js' -WorkingDirectory 'C:\apps\mi-cliente-ag\backend'
Register-ScheduledTask -TaskName 'MiClienteAG-PurgaCargas' -Action $purge -Trigger (New-ScheduledTaskTrigger -Daily -At 2am) -User 'SYSTEM' -RunLevel Highest

# Respaldo de base y adjuntos, 01:00
$backup = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\apps\mi-cliente-ag\infrastructure\qa-windows\respaldo.ps1'
Register-ScheduledTask -TaskName 'MiClienteAG-Respaldo' -Action $backup -Trigger (New-ScheduledTaskTrigger -Daily -At 1am) -User 'SYSTEM' -RunLevel Highest
```

Copia `C:\data\mi-cliente-ag\backups` fuera del servidor con la política de respaldos de la
empresa. Restaurar: `pg_restore --clean --if-exists --no-owner --no-privileges` sobre la base y
descomprimir el ZIP de la misma marca de tiempo en `attachments`.

## 12. Actualizar QA

```powershell
powershell -ExecutionPolicy Bypass -File C:\apps\mi-cliente-ag\infrastructure\qa-windows\actualizar.ps1
```

Con Entra ID, `frontend\.env.production.local` (apartado 4.1) debe existir **antes**: el paso de
compilación incrusta esas variables y no se leen después.

Detiene el backend (el motor de Prisma queda bloqueado mientras corre), trae `main`, instala,
compila, migra, ejecuta la semilla esencial (idempotente), arranca, valida y recarga NGINX y
comprueba `/api/v1/ready`. Se detiene en el primer error; el sitio no responde mientras dura
(unos minutos).

Backend y frontend se compilan y despliegan juntos, como exige el endurecimiento para internet
(el backend pide la cabecera `X-Requested-With` que solo envía el frontend nuevo). La primera
actualización que incluye ese cambio cierra **una vez** las sesiones locales vigentes (la cookie
pasa a llamarse `__Secure-refresh_token`): avisa a los usuarios de que tendrán que volver a entrar.
Tras actualizar, repite las comprobaciones del borde del paso 10.

## 13. Carga inicial de datos

Carga de **proyectos**, **productos y familias** y **minutos de seguridad** desde archivos con
plantilla, ejecutada por quien administra el servidor (no hay pantalla ni endpoint). Diseño y
reglas: [`CARGA-INICIAL.md`](../implementation-plans/CARGA-INICIAL.md); plantillas, orden de carga y
manejo de errores: [`docs/templates/README.md`](../templates/README.md). Usa los servicios de la
aplicación, así que aplica folios, unicidad, visibilidad y **auditoría** con el administrador que
indiques en `--actor`. Requiere haber ejecutado la semilla esencial y tener creados los usuarios y
los clientes (orden: usuarios → clientes → proyectos).

Desde `C:\apps\mi-cliente-ag`, en PowerShell (no hace falta ser administrador de Windows; el
script lee `backend\.env` como el servicio). Guarda los archivos fuera del repositorio, p. ej.
`C:\data\mi-cliente-ag\cargas`:

```powershell
cd C:\apps\mi-cliente-ag
New-Item -ItemType Directory -Force C:\data\mi-cliente-ag\cargas | Out-Null

# 1. Plantilla con los códigos activos reales de la base de QA (se escribe un XLSX o los CSV)
pnpm --filter '@app/backend' run load:data -- template projects --format xlsx --out C:\data\mi-cliente-ag\cargas

# 2. Llena la hoja de datos y VALIDA (no escribe nada; imprime servidor, base y esquema)
pnpm --filter '@app/backend' run load:data -- validate projects --file C:\data\mi-cliente-ag\cargas\proyectos.xlsx

# 3. Con la validación en 0, APLICA con un administrador activo (correo o código de colaborador)
pnpm --filter '@app/backend' run load:data -- apply projects --file C:\data\mi-cliente-ag\cargas\proyectos.xlsx --actor '<correo del administrador de QA>'
```

Las entidades son `projects`, `products` y `safety-minutes`; con `products` y CSV, `--file` es el
archivo de productos y el de familias es el de al lado con el sufijo `-familias`. Si
`NODE_ENV=production` en el servidor, `apply` exige además `--confirm-production`.

- Comprueba la línea `Base de datos: … (esquema …)` antes de aplicar: debe ser `mi_cliente_ag`
  (esquema `public`) de QA.
- Código de salida: `0` sin errores; `1` errores de validación o de aplicación (se escribe
  `informe-carga-<entidad>-<modo>-<fecha>.csv` en la carpeta actual, o la ruta de `--report`,
  con hoja, fila, columna y motivo, sin datos de las celdas); `2` comando, archivo, actor o
  entorno rechazados. Compruébalo con `$LASTEXITCODE`.
- Repetir es seguro: lo que ya existe se omite como «ya existe» sin modificarlo; con errores de
  validación no se aplica nada.
- Al terminar, borra los **archivos de entrada**: pueden contener correos de colaboradores. Los
  informes no contienen datos de celdas (solo hoja, fila, columna y motivo).
- Advertencias (código de salida 0): `EXISTS_DIFFERENT` (ya existía con datos distintos: se omitió
  sin modificar; revisa en la aplicación) y `CLASSIFICATION_FAILED` (el proyecto se creó pero sin
  tipo y sector). **Reparación de `CLASSIFICATION_FAILED`:** abre el proyecto en la aplicación
  (Proyectos), guarda su tipo y sector; volver a ejecutar `apply` lo omite como «ya existe» y no lo
  arregla.
- `template` no sobrescribe plantillas existentes: usa otra carpeta o `--force`.
- Verifica el resultado en la aplicación y en la bitácora de auditoría (eventos
  `crm.project.created`, `crm.product_family.created`, `crm.product.created`,
  `safety_minute.created`).
- No uses este procedimiento para datos de demostración: esos van con `prisma:seed:demo`.

### 13.1 Ensayar la carga: borrar clientes y proyectos de QA

Para repetir la carga desde cero hasta tener los archivos definitivos de producción (ADR-031),
`limpiar-datos-negocio.ps1` borra **todos los clientes y proyectos de QA** y lo que depende de ellos:
contactos, importaciones de clientes, historial de fase, productos asociados, forecast, oportunidades
(con su historial y resultados), visitas, actividades y adjuntos (también los archivos de
`C:\data\mi-cliente-ag\attachments`). **Conserva** usuarios, vínculos con Entra ID, equipos, roles,
catálogos, países, unidades, productos, parámetros y auditoría. Los folios (`CLI-`, `PRY-`, `OPO-`)
continúan la numeración.

```powershell
powershell -ExecutionPolicy Bypass -File C:\apps\mi-cliente-ag\infrastructure\qa-windows\limpiar-datos-negocio.ps1
```

Muestra cuántas filas va a borrar, pide escribir `BORRAR CLIENTES Y PROYECTOS`, ejecuta
`respaldo.ps1` (si el respaldo falla no borra nada) y borra en una sola transacción. Se niega a
correr si el usuario de base de datos no termina en `_qa` o si el servidor no es `localhost`. Para
deshacerlo, restaura el respaldo como se indica en el apartado 11. No existe ni debe existir un
equivalente para producción.

## 14. Antes de Entra ID

Entra ID no acepta direcciones de redirección `https://<IP>`: QA necesita un **nombre DNS** y un
**certificado válido para ese nombre**. Decisión del responsable (2026-10-15): el nombre es
`miclienteag-qa.somosgrupoag.com`. Lleva **guion medio**: el guion bajo (`_`) no es válido en
nombres de host y los navegadores y certificados lo rechazan.

Requisitos de la **API** registrada en el tenant (los configura su administrador):

- Que emita **tokens v2** (`accessTokenAcceptedVersion = 2` en el manifiesto de la API).
- **«Asignación de usuarios requerida» = Sí** en la aplicación empresarial: solo entran las
  personas o grupos asignados.
- **Consentimiento de usuario desactivado**: solo el administrador concede los permisos.

Orden recomendado (los pasos 1 a 3 los hace infraestructura):

1. **DNS.** Registro `A` (o `CNAME`) `miclienteag-qa.somosgrupoag.com` hacia la IP del servidor de
   QA. Comprueba desde otro equipo: `Resolve-DnsName miclienteag-qa.somosgrupoag.com`.
2. **Certificado.** Uno emitido para `miclienteag-qa.somosgrupoag.com` (CN y SAN) por una CA que
   los navegadores de los usuarios ya confíen. Guárdalo como `C:\nginx\ssl\qa.crt` y `qa.key`
   (PEM, mismos permisos del paso 8) y reinicia `MiClienteAG-NGINX`. `server_name _` de
   `nginx.conf` ya atiende cualquier nombre: no hay que editarlo.
3. **Registro de la aplicación (administrador del tenant).** Plataforma **«Aplicación de una sola
   página» (SPA)**, no «Web»: el canje del código es una petición `fetch` entre orígenes y solo la
   plataforma SPA responde con CORS. Redirect URIs de QA:
   - `https://miclienteag-qa.somosgrupoag.com/auth/callback` (respuesta del inicio de sesión).
   - `https://miclienteag-qa.somosgrupoag.com/acceso` (destino tras cerrar sesión).

   Para desarrollo, `http://localhost:5173/auth/callback` y `http://localhost:5173/acceso`. El
   administrador entrega el client ID, el authority (con el ID del tenant) y el scope de la API:
   **no se escriben en archivos versionados** (ni en este documento).
4. **Backend (`C:\apps\mi-cliente-ag\backend\.env`).** Cambia `CORS_ALLOWED_ORIGINS` a
   `https://miclienteag-qa.somosgrupoag.com` (el origen sin ruta ni barra final; si durante la
   transición se sigue entrando por IP, se pueden listar ambos separados por coma) y configura el
   proveedor Entra del backend: las variables `AUTH_PROVIDER` y `ENTRA_*` están en
   [`AUTHENTICATION.md`](../../AUTHENTICATION.md) y en el ADR-027. Con `AUTH_PROVIDER=entra` son
   **obligatorias en producción** `ENTRA_REQUIRED_SCOPE` (el scope que el token debe traer) y
   `ENTRA_ALLOWED_CLIENT_IDS` (los client ID de las aplicaciones autorizadas a llamar a la API,
   entre ellos el de la SPA). Los valores los entrega el administrador del tenant y **no se
   versionan**. Reinicia el servicio:
   `Restart-Service MiClienteAG-API`.
5. **Variables del frontend** en `frontend\.env.production.local` (apartado 4.1), **antes** de
   ejecutar `actualizar.ps1`.
6. **Actualizar QA** (paso 12): compila con esas variables incrustadas.

Comprobación posterior, entrando por `https://miclienteag-qa.somosgrupoag.com`:

- `/acceso` muestra solo el botón «Continuar» (sin correo ni contraseña) y el menú de usuario no
  ofrece «Cambiar contraseña».
- El primer ingreso de una persona que no existía crea su cuenta **sin permisos**: ve «Acceso
  pendiente». El administrador la habilita en Administración → Usuarios (filtro «Pendientes de
  acceso») asignándole un rol; la persona pulsa «Volver a comprobar» o vuelve a entrar.
- Si el backend rechaza la identidad, el login muestra el motivo: cuenta sin vincular, identidad sin
  correo utilizable o alta automática desactivada. En los tres casos se contacta al administrador.
- Cerrar sesión termina también la sesión de Microsoft y vuelve a `/acceso`.

La política CSP de NGINX ya permite `https://login.microsoftonline.com` en `connect-src`
(`infrastructure/nginx/conf.d/security-headers.conf`); no se abren iframes ni ventanas emergentes.
