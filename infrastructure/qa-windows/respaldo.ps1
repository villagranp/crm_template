<#
.SYNOPSIS
  Respaldo de QA (ADR-021, ADR-026): base de datos y adjuntos, juntos.

.DESCRIPTION
  pg_dump en formato personalizado (-Fc, se restaura con pg_restore) y un ZIP
  de la carpeta de adjuntos con la misma marca de tiempo, para restaurar ambos
  coherentes. Borra los respaldos con mas de $RetentionDays dias.
  La contrasena NO va en este script: pg_dump la lee de
  %APPDATA%\postgresql\pgpass.conf de la cuenta que ejecuta la tarea
  (linea: localhost:5432:mi_cliente_ag:mi_cliente_ag_qa:<contrasena>).
  Runbook: docs/deployment/qa-windows.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\apps\mi-cliente-ag\infrastructure\qa-windows\respaldo.ps1
#>
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
  [string]$Database = 'mi_cliente_ag',
  [string]$DbUser = 'mi_cliente_ag_qa',
  [string]$AttachmentsDir = 'C:\data\mi-cliente-ag\attachments',
  [string]$BackupDir = 'C:\data\mi-cliente-ag\backups',
  [int]$RetentionDays = 14
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'

$dumpFile = Join-Path $BackupDir "$($Database)_$stamp.dump"
& (Join-Path $PgBin 'pg_dump.exe') -h localhost -U $DbUser -d $Database -Fc -w -f $dumpFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo (codigo $LASTEXITCODE)" }

if ((Test-Path $AttachmentsDir) -and (Get-ChildItem $AttachmentsDir -Recurse -File | Select-Object -First 1)) {
  Compress-Archive -Path (Join-Path $AttachmentsDir '*') -DestinationPath (Join-Path $BackupDir "attachments_$stamp.zip")
}

Get-ChildItem $BackupDir -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Force

Write-Host "Respaldo completado: $dumpFile"
