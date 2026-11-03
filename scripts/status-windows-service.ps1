param(
  [string]$ServiceName = 'PDV-API',
  [string]$ApplicationRoot = 'C:\ProgramData\PDV\app'
)

$ErrorActionPreference = 'Stop'

$service = Get-Service -Name $ServiceName -ErrorAction Stop
$service | Select-Object Name, DisplayName, Status, StartType

try {
  $envPath = Join-Path $ApplicationRoot '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Arquivo de ambiente não encontrado: $envPath"
  }
  $tokenLine = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match '^PDV_API_TOKEN=' } |
    Select-Object -First 1
  if (-not $tokenLine) {
    throw 'PDV_API_TOKEN não encontrado no arquivo de ambiente.'
  }
  $token = ($tokenLine -replace '^PDV_API_TOKEN=', '').Trim().Trim('"')
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'PDV_API_TOKEN vazio no arquivo de ambiente.'
  }
  $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -Headers @{
    Authorization = "Bearer $token"
  } -TimeoutSec 5
  $health | ConvertTo-Json -Compress
} catch {
  Write-Error "Health check da API falhou: $($_.Exception.Message)"
  exit 1
}
