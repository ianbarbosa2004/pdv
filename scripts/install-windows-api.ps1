param(
  [string]$DatabaseRootUser = 'root',
  [string]$DatabaseRootHost = '127.0.0.1',
  [int]$DatabaseRootPort = 3306,
  [string]$DatabaseName = 'pdv',
  [string]$ServiceName = 'PDV-API',
  [string]$ServiceAccount = 'PDVApiSvc',
  [string]$InstallDirectory = 'C:\ProgramData\PDV\app',
  [string]$ServiceDirectory = 'C:\ProgramData\PDV\service',
  [string]$LogDirectory = 'C:\ProgramData\PDV\logs'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8
function Write-Step([string]$Message) {
  Write-Host "[PDV] $Message" -ForegroundColor Cyan
}

function Read-MariaDbPassword([string]$Prompt) {
  Write-Host "$Prompt (cole com Ctrl+V ou botão direito; Enter confirma): " -NoNewline
  $securePassword = New-Object System.Security.SecureString
  while ($true) {
    $key = [Console]::ReadKey($true)
    if ($key.Key -eq [ConsoleKey]::Enter) { break }
    if ($key.Key -eq [ConsoleKey]::Backspace) {
      if ($securePassword.Length -gt 0) {
        $securePassword.RemoveAt($securePassword.Length - 1)
        Write-Host "`b `b" -NoNewline
      }
      continue
    }
    if ([int][char]$key.KeyChar -eq 3) {
      throw 'Entrada da senha cancelada.'
    }
    if (-not [char]::IsControl($key.KeyChar)) {
      $securePassword.AppendChar($key.KeyChar)
      Write-Host '*' -NoNewline
    }
  }
  Write-Host
  return $securePassword
}

Write-Step 'Validando permissões administrativas e ferramentas instaladas...'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este script em uma sessão elevada do PowerShell.'
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$mysqlPath = @(
  'C:\Program Files\MariaDB 13.0\bin\mysql.exe',
  'C:\Program Files\MariaDB 11.4\bin\mysql.exe',
  'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $mysqlPath) { throw 'mysql.exe não foi encontrado.' }

$rootPasswordSecure = Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'
$rootPassword = [System.Net.NetworkCredential]::new('', $rootPasswordSecure).Password
if ([string]::IsNullOrWhiteSpace($rootPassword)) {
  throw 'A senha administrativa do MariaDB não pode estar vazia.'
}

Write-Step 'Gerando credenciais da aplicação em memória...'
$randomBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
$apiToken = [Convert]::ToHexString($randomBytes).ToLowerInvariant()
$certificateKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$databasePassword = -join (1..40 | ForEach-Object {
  $passwordAlphabet[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($passwordAlphabet.Length)]
})

New-Item -ItemType Directory -Force -Path $InstallDirectory, $ServiceDirectory, $LogDirectory | Out-Null
Write-Step "Diretórios operacionais preparados em $InstallDirectory."
$publishedEnvPath = Join-Path $InstallDirectory '.env'
if (-not (Test-Path -LiteralPath $publishedEnvPath -PathType Leaf)) {
  @(
    'PDV_API_HOST=0.0.0.0'
    'PDV_API_PORT=3000'
    "PDV_API_TOKEN=$apiToken"
    'PDV_API_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost'
    "PDV_DB_HOST=$DatabaseRootHost"
    "PDV_DB_PORT=$DatabaseRootPort"
    "PDV_DB_NAME=$DatabaseName"
    'PDV_DB_USER=pdv_app'
    'PDV_DB_PASSWORD='
    "PDV_CERTIFICATE_ENCRYPTION_KEY=$certificateKey"
  ) | Set-Content -LiteralPath $publishedEnvPath -Encoding ASCII
  Write-Step 'Arquivo .env operacional criado.'
} else {
  Write-Step 'Arquivo .env operacional existente preservado.'
}

$escapedDatabasePassword = $databasePassword.Replace('\', '\\').Replace("'", "\'")
$quotedDatabaseName = "``$DatabaseName``"
$databaseSql = @"
CREATE DATABASE IF NOT EXISTS $quotedDatabaseName;
CREATE USER IF NOT EXISTS 'pdv_app'@'127.0.0.1' IDENTIFIED BY '$escapedDatabasePassword';
ALTER USER 'pdv_app'@'127.0.0.1' IDENTIFIED BY '$escapedDatabasePassword';
CREATE USER IF NOT EXISTS 'pdv_app'@'localhost' IDENTIFIED BY '$escapedDatabasePassword';
ALTER USER 'pdv_app'@'localhost' IDENTIFIED BY '$escapedDatabasePassword';
GRANT ALL PRIVILEGES ON $quotedDatabaseName.* TO 'pdv_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON $quotedDatabaseName.* TO 'pdv_app'@'localhost';
FLUSH PRIVILEGES;
"@

$rootCredentialFile = Join-Path $env:TEMP "pdv-mariadb-$([guid]::NewGuid().ToString('N')).cnf"
$mysqlBootstrapSucceeded = $false
try {
  Write-Step 'Preparando banco de dados e usuário da API no MariaDB...'
  @(
    '[client]'
    "user=$DatabaseRootUser"
    "password=$rootPassword"
    "host=$DatabaseRootHost"
    "port=$DatabaseRootPort"
  ) | Set-Content -LiteralPath $rootCredentialFile -Encoding ASCII
  $databaseSql | & $mysqlPath "--defaults-extra-file=$rootCredentialFile"
  if ($LASTEXITCODE -ne 0) { throw "A preparação do MariaDB falhou (código $LASTEXITCODE)." }
  $mysqlBootstrapSucceeded = $true
  Write-Step 'MariaDB preparado.'
} finally {
  if (-not $mysqlBootstrapSucceeded) {
    Remove-Item -LiteralPath $rootCredentialFile -Force -ErrorAction SilentlyContinue
  }
  $rootPassword = $null
  $rootPasswordSecure = $null
}

$checkoutEnvPath = Join-Path $repositoryRoot '.env'
$temporaryCheckoutEnv = $false
if (-not (Test-Path -LiteralPath $checkoutEnvPath -PathType Leaf)) {
  @(
    "PDV_API_HOST=127.0.0.1"
    'PDV_API_PORT=3000'
    "PDV_API_TOKEN=$apiToken"
    "PDV_DB_HOST=$DatabaseRootHost"
    "PDV_DB_PORT=$DatabaseRootPort"
    "PDV_DB_NAME=$DatabaseName"
    'PDV_DB_USER=pdv_app'
    "PDV_DB_PASSWORD=$databasePassword"
    "PDV_CERTIFICATE_ENCRYPTION_KEY=$certificateKey"
  ) | Set-Content -LiteralPath $checkoutEnvPath -Encoding ASCII
  $temporaryCheckoutEnv = $true
}

try {
  if (-not (Get-LocalUser -Name $ServiceAccount -ErrorAction SilentlyContinue)) {
    Write-Step "Criando conta local $ServiceAccount..."
    $bootstrapServicePassword = ConvertTo-SecureString (
      -join (1..40 | ForEach-Object {
        $passwordAlphabet[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($passwordAlphabet.Length)]
      })
    ) -AsPlainText -Force
    New-LocalUser -Name $ServiceAccount `
      -Password $bootstrapServicePassword `
      -Description 'Conta exclusiva do serviço da API do PDV.' `
      -PasswordNeverExpires `
      -UserMayNotChangePassword | Out-Null
    $bootstrapServicePassword = $null
  } else {
    Write-Step "Conta local $ServiceAccount já existe."
  }
  $service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
  if (-not $service) {
    Write-Step 'Instalando o serviço Windows, sem iniciá-lo ainda...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repositoryRoot 'scripts\install-windows-service.ps1') `
      -InstallDirectory $ServiceDirectory -LogDirectory $LogDirectory -ServiceName $ServiceName `
      -ApplicationDirectory $InstallDirectory -SkipStart
    if ($LASTEXITCODE -ne 0) { throw "A instalação inicial do serviço falhou (código $LASTEXITCODE)." }
  } else {
    Write-Step "Serviço $ServiceName já existe."
  }
  Write-Step 'Publicando a aplicação e instalando dependências na pasta operacional...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repositoryRoot 'scripts\publish-windows-api-service.ps1') `
    -ServiceName $ServiceName -ServiceAccount $ServiceAccount `
    -InstallDirectory $InstallDirectory -ServiceDirectory $ServiceDirectory -LogDirectory $LogDirectory `
    -DatabaseCredentialFile $rootCredentialFile
  if ($LASTEXITCODE -ne 0) { throw "A publicação da API falhou (código $LASTEXITCODE)." }
  Write-Step 'Publicação concluída; serviço iniciado e validado.'
} finally {
  if ($temporaryCheckoutEnv) {
    Remove-Item -LiteralPath $checkoutEnvPath -Force -ErrorAction SilentlyContinue
  }
  $databasePassword = $null
  $apiToken = $null
  $certificateKey = $null
  Remove-Item -LiteralPath $rootCredentialFile -Force -ErrorAction SilentlyContinue
}

Write-Step "Instalação concluída em $InstallDirectory."
