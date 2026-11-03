param(
  [string]$InstallDirectory = 'C:\ProgramData\PDV\service',
  [string]$ServiceName = 'PDV-API',
  [string]$ApplicationDirectory = 'C:\ProgramData\PDV\app',
  [string]$LogDirectory = 'C:\ProgramData\PDV\logs',
  [string]$ServiceAccount = 'PDVApiSvc',
  [string]$PdvRoot = 'C:\ProgramData\PDV'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8

$winswPath = Join-Path $InstallDirectory "$ServiceName.exe"
if (Test-Path -LiteralPath $winswPath) {
  & $winswPath stop | Out-Null
  & $winswPath uninstall | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível remover o serviço $ServiceName."
  }
}

$publishedEnvPath = Join-Path $ApplicationDirectory '.env'
$credentialService = 'pdv-mariadb'
$credentialAccount = $null
if (Test-Path -LiteralPath $publishedEnvPath -PathType Leaf) {
  $envValues = @{}
  foreach ($line in Get-Content -LiteralPath $publishedEnvPath) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $envValues[$matches[1]] = $matches[2].Trim().Trim('"')
    }
  }
  if ($envValues.ContainsKey('PDV_DB_CREDENTIAL_SERVICE') -and $envValues.PDV_DB_CREDENTIAL_SERVICE) {
    $credentialService = $envValues.PDV_DB_CREDENTIAL_SERVICE
  }
  $databaseUser = if ($envValues.PDV_DB_USER) { $envValues.PDV_DB_USER } else { 'pdv_app' }
  $databaseHost = if ($envValues.PDV_DB_HOST) { $envValues.PDV_DB_HOST } else { '127.0.0.1' }
  $databasePort = if ($envValues.PDV_DB_PORT) { $envValues.PDV_DB_PORT } else { '3306' }
  $databaseName = if ($envValues.PDV_DB_NAME) { $envValues.PDV_DB_NAME } else { 'pdv' }
  $credentialAccount = "$databaseUser@$databaseHost`:$databasePort/$databaseName"
  if ($envValues.PDV_DB_CREDENTIAL_ACCOUNT) {
    $credentialAccount = $envValues.PDV_DB_CREDENTIAL_ACCOUNT
  }
}

if ($credentialAccount) {
  $nodePath = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($nodePath -and (Test-Path -LiteralPath (Join-Path $ApplicationDirectory 'scripts\remove-database-credential.mjs'))) {
    & $nodePath.Source (Join-Path $ApplicationDirectory 'scripts\remove-database-credential.mjs') `
      '--service' $credentialService '--account' $credentialAccount
    if ($LASTEXITCODE -ne 0) {
      throw 'Não foi possível remover a credencial do MariaDB.'
    }
  }
}

$pathsToRemove = @($InstallDirectory, $ApplicationDirectory, $LogDirectory) |
  Where-Object { Test-Path -LiteralPath $_ -PathType Container }
foreach ($path in $pathsToRemove) {
  Remove-Item -LiteralPath $path -Recurse -Force
}

if (Test-Path -LiteralPath $PdvRoot -PathType Container) {
  $remainingEntries = Get-ChildItem -LiteralPath $PdvRoot -Force -ErrorAction Stop
  if (-not $remainingEntries) {
    Remove-Item -LiteralPath $PdvRoot -Force
  } else {
    Write-Output "O diretório $PdvRoot foi preservado porque contém outros arquivos."
  }
}

$localUser = Get-LocalUser -Name $ServiceAccount -ErrorAction SilentlyContinue
if ($localUser) {
  Remove-LocalUser -Name $ServiceAccount
}

Write-Output "Serviço, aplicação publicada, logs, conta $ServiceAccount e credencial removidos."
Write-Output 'Banco de dados MariaDB preservado.'
