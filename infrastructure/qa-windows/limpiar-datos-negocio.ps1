<#
.SYNOPSIS
  Borra los datos de clientes y proyectos de QA para ensayar la carga inicial (ADR-031).

.DESCRIPTION
  Solo para QA. Primero hace un respaldo con respaldo.ps1 (base y adjuntos), muestra cuantas
  filas se van a borrar y pide escribir la confirmacion. Despues, en una sola transaccion,
  vacia clientes e importaciones de clientes y, en cascada, todo lo que depende de ellos:
  contactos, proyectos (historial de fase, productos, forecast), oportunidades (historial y
  resultados), visitas, actividades y adjuntos. Por ultimo vacia la carpeta de adjuntos.

  NO toca usuarios, vinculos con Entra ID, equipos, roles, catalogos, paises, unidades,
  productos, parametros ni la auditoria. Los folios (CLI-, PRY-, OPO-) siguen su numeracion.

  Se niega a ejecutarse si el usuario de base de datos no es de QA (termina en _qa) o si el
  servidor no es localhost. La contrasena la lee psql de pgpass.conf, igual que respaldo.ps1.
  Runbook: docs/deployment/qa-windows.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\apps\mi-cliente-ag\infrastructure\qa-windows\limpiar-datos-negocio.ps1
#>
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
  [string]$DbHost = 'localhost',
  [string]$Database = 'mi_cliente_ag',
  [string]$DbUser = 'mi_cliente_ag_qa',
  [string]$AttachmentsDir = 'C:\data\mi-cliente-ag\attachments',
  [string]$BackupDir = 'C:\data\mi-cliente-ag\backups'
)

$ErrorActionPreference = 'Stop'
$Confirmation = 'BORRAR CLIENTES Y PROYECTOS'

# --- Protecciones: solo QA, solo local.
if (-not $DbUser.EndsWith('_qa')) { throw "Se niega a ejecutar: el usuario de base de datos '$DbUser' no es de QA." }
if ($DbHost -ne 'localhost' -and $DbHost -ne '127.0.0.1') { throw "Se niega a ejecutar: el servidor '$DbHost' no es local." }

$psql = Join-Path $PgBin 'psql.exe'
if (-not (Test-Path $psql)) { throw "No se encontro psql en $PgBin" }

function Invoke-Sql([string]$Sql) {
  $output = & $psql -h $DbHost -U $DbUser -d $Database -w -v ON_ERROR_STOP=1 -At -F '|' -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql fallo (codigo $LASTEXITCODE)" }
  return $output
}

$countSql = @"
select 'Clientes', count(*) from customers
union all select 'Contactos', count(*) from contacts
union all select 'Importaciones de clientes', count(*) from customer_imports
union all select 'Proyectos', count(*) from projects
union all select 'Oportunidades', count(*) from opportunities
union all select 'Lineas de forecast', count(*) from forecast_lines
union all select 'Visitas', count(*) from visits
union all select 'Actividades', count(*) from activities
union all select 'Adjuntos', count(*) from attachments;
"@

function Show-Counts([string]$Title) {
  Write-Host ''
  Write-Host $Title
  foreach ($line in (Invoke-Sql $countSql)) {
    $parts = $line -split '\|'
    Write-Host ('  {0,-28} {1,8}' -f $parts[0], $parts[1])
  }
}

Write-Host "Base de datos: $DbHost/$Database (usuario $DbUser)"
Show-Counts 'Se van a borrar:'

Write-Host ''
Write-Host 'Se conservan: usuarios, vinculos con Entra ID, equipos, roles, catalogos, paises, unidades, productos, parametros y auditoria.'
Write-Host "Para continuar escriba exactamente: $Confirmation"
$answer = Read-Host 'Confirmacion'
if ($answer -cne $Confirmation) {
  Write-Host 'Cancelado: no se borro nada.'
  exit 1
}

# --- Respaldo antes de borrar (si falla, no se borra nada).
Write-Host ''
Write-Host 'Respaldando base y adjuntos...'
& (Join-Path $PSScriptRoot 'respaldo.ps1') -PgBin $PgBin -Database $Database -DbUser $DbUser -AttachmentsDir $AttachmentsDir -BackupDir $BackupDir
if (-not $?) { throw 'El respaldo fallo: no se borro nada.' }

# --- Borrado en una transaccion. CASCADE vacia las tablas que dependen de clientes
# (contactos, proyectos y sus historiales, oportunidades, forecast, visitas, actividades, adjuntos).
Write-Host 'Borrando datos de clientes y proyectos...'
Invoke-Sql 'begin; truncate table customer_imports, customers cascade; commit;' | Out-Null

if (Test-Path $AttachmentsDir) {
  Get-ChildItem $AttachmentsDir -Force | Remove-Item -Recurse -Force
}

Show-Counts 'Despues del borrado:'
Write-Host ''
Write-Host 'Listo. El respaldo esta en' $BackupDir '(se restaura con pg_restore).'
