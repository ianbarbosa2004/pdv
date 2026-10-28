param(
  [string]$InstallDirectory = 'C:\ProgramData\PDV\service',
  [string]$ServiceName = 'PDV-API'
)

$ErrorActionPreference = 'Stop'

$winswPath = Join-Path $InstallDirectory "$ServiceName.exe"
if (-not (Test-Path $winswPath)) {
  Write-Output "Wrapper do serviço não encontrado: $winswPath"
  exit 0
}

& $winswPath stop
& $winswPath uninstall
Write-Output "Serviço $ServiceName removido. Logs e o checkout foram preservados."
