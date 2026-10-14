<#
.SYNOPSIS
  Actualiza QA (Windows Server, ADR-026) a la ultima version de main.

.DESCRIPTION
  Detiene el backend, trae main, instala dependencias, regenera el cliente de
  Prisma, compila backend y frontend, aplica migraciones (migrate deploy, nunca
  migrate dev), ejecuta la semilla esencial (idempotente: anade permisos, menus
  y parametros nuevos sin tocar los existentes), arranca el backend, recarga
  NGINX y comprueba la salud. Se detiene en el primer error.
  Runbook: docs/deployment/qa-windows.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\apps\mi-cliente-ag\infrastructure\qa-windows\actualizar.ps1
#>
param(
  [string]$AppDir = 'C:\apps\mi-cliente-ag',
  [string]$NginxDir = 'C:\nginx',
  [string]$ServiceName = 'MiClienteAG-API',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Invoke-Step([string]$Name, [scriptblock]$Command) {
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Fallo en: $Name (codigo $LASTEXITCODE)" }
}

Set-Location $AppDir

# El motor de Prisma queda bloqueado mientras el backend corre (EPERM en Windows).
Write-Host "==> Deteniendo $ServiceName" -ForegroundColor Cyan
Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue

Invoke-Step 'git checkout' { git checkout $Branch }
Invoke-Step 'git pull' { git pull --ff-only origin $Branch }
Invoke-Step 'pnpm install' { pnpm install --frozen-lockfile }
Invoke-Step 'prisma generate' { pnpm --filter '@app/backend' exec prisma generate }
Invoke-Step 'build' { pnpm build }
Invoke-Step 'migraciones' { pnpm --filter '@app/backend' run prisma:deploy }
Invoke-Step 'semilla esencial' { pnpm --filter '@app/backend' run prisma:seed }

Write-Host "==> Arrancando $ServiceName" -ForegroundColor Cyan
Start-Service -Name $ServiceName

$nginxConf = Join-Path $AppDir 'infrastructure\qa-windows\nginx.conf'
Invoke-Step 'nginx -t' { & (Join-Path $NginxDir 'nginx.exe') -p "$NginxDir\" -c $nginxConf -t }
Invoke-Step 'nginx reload' { & (Join-Path $NginxDir 'nginx.exe') -p "$NginxDir\" -c $nginxConf -s reload }

Write-Host '==> Comprobando salud del backend' -ForegroundColor Cyan
$healthy = $false
for ($i = 0; $i -lt 30 -and -not $healthy; $i++) {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/v1/ready' -UseBasicParsing -TimeoutSec 5
    $healthy = $response.StatusCode -eq 200
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $healthy) { throw 'El backend no responde en /api/v1/ready: revisa C:\data\mi-cliente-ag\logs\api.log' }

$commit = git rev-parse --short HEAD
Write-Host "QA actualizado a $commit" -ForegroundColor Green
