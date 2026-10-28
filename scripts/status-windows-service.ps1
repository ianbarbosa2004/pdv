param(
  [string]$ServiceName = 'PDV-API'
)

$ErrorActionPreference = 'Stop'

$service = Get-Service -Name $ServiceName -ErrorAction Stop
$service | Select-Object Name, DisplayName, Status, StartType

try {
  $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 5
  $health | ConvertTo-Json -Compress
} catch {
  Write-Error "Health check da API falhou: $($_.Exception.Message)"
  exit 1
}
