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
- `CORS_ALLOWED_ORIGINS`: `https://<IP del servidor>`.

Restringe el archivo a administradores y `SYSTEM` (la cuenta del servicio):

```powershell
icacls C:\apps\mi-cliente-ag\backend\.env /inheritance:r /grant:r "Administrators:F" "SYSTEM:R"
```

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

`--no-owner --no-privileges` deja todo a nombre de `mi_cliente_ag_qa`. Un aviso sobre el
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
`infrastructure/nginx` y sirve `frontend\dist`.

## 10. Verificación

Desde otro equipo de la red:

1. `http://<IP>:8080/` redirige a `https://<IP>/` (con certificado autofirmado, el navegador avisa
   una vez).
2. `https://<IP>/healthz` → `ok`; `https://<IP>/api/v1/ready` → 200.
3. `https://<IP>/api/docs` → 404.
4. Inicia sesión con el administrador, cambia la contraseña inicial y comprueba el menú.
5. Recarga la página: la sesión se mantiene (cookie `Secure` sobre HTTPS).
6. Si se usará la carga masiva: Administración → Parámetros → «Carga masiva habilitada».

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

Detiene el backend (el motor de Prisma queda bloqueado mientras corre), trae `main`, instala,
compila, migra, ejecuta la semilla esencial (idempotente), arranca, valida y recarga NGINX y
comprueba `/api/v1/ready`. Se detiene en el primer error; el sitio no responde mientras dura
(unos minutos).

## 13. Antes de Entra ID

Entra ID no acepta direcciones de redirección `https://<IP>`. Pide a infraestructura un
nombre DNS de QA y un certificado válido para él; después se sustituye `qa.crt`/`qa.key`, se
actualiza `CORS_ALLOWED_ORIGINS` y se registra la aplicación (ADR-007).
