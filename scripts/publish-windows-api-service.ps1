param(
  [string]$ServiceName = 'PDV-API',
  [string]$ServiceAccount = 'PDVApiSvc',
  [string]$InstallDirectory = 'C:\ProgramData\PDV\app',
  [string]$ServiceDirectory = 'C:\ProgramData\PDV\service',
  [string]$LogDirectory = 'C:\ProgramData\PDV\logs',
  [string]$DatabaseCredentialFile = ''
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

function Test-MariaDbCredential([string]$MysqlExecutable, [string]$CredentialFile) {
  if (-not (Test-Path -LiteralPath $CredentialFile -PathType Leaf)) {
    throw 'Arquivo de credenciais do MariaDB não encontrado.'
  }
  & $MysqlExecutable "--defaults-extra-file=$CredentialFile" '--protocol=tcp' '--connect-timeout=5' '--batch' '--skip-column-names' '--execute=SELECT 1;' 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'A senha do usuário administrativo do MariaDB está incorreta ou não permite conexão TCP local.'
  }
}

try {
  $temporaryDatabaseCredentialFile = $false
  $mysqlPath = @(
    'C:\Program Files\MariaDB 13.0\bin\mysql.exe',
    'C:\Program Files\MariaDB 11.4\bin\mysql.exe',
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $mysqlPath) { throw 'mysql.exe não foi encontrado.' }

  if ([string]::IsNullOrWhiteSpace($DatabaseCredentialFile)) {
    $rootPasswordSecure = Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'
    $rootPassword = [System.Net.NetworkCredential]::new('', $rootPasswordSecure).Password
    if ([string]::IsNullOrWhiteSpace($rootPassword)) {
      throw 'A senha administrativa do MariaDB não pode estar vazia.'
    }
    $DatabaseCredentialFile = Join-Path $env:TEMP "pdv-mariadb-$([guid]::NewGuid().ToString('N')).cnf"
    @(
      '[client]'
      'user=root'
      "password=$rootPassword"
      'host=127.0.0.1'
      'port=3306'
    ) | Set-Content -LiteralPath $DatabaseCredentialFile -Encoding ASCII
    $rootPassword = $null
    $rootPasswordSecure = $null
    $temporaryDatabaseCredentialFile = $true
  }
  Test-MariaDbCredential $mysqlPath $DatabaseCredentialFile

function Grant-ServiceLogonRight([string]$AccountSid) {
  $securityConfig = Join-Path $env:TEMP "pdv-security-$([guid]::NewGuid().ToString('N')).inf"
  $securityDatabase = Join-Path $env:TEMP "pdv-security-$([guid]::NewGuid().ToString('N')).sdb"
  try {
    & secedit.exe /export /cfg $securityConfig /areas USER_RIGHTS /quiet | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível exportar a política de segurança local.' }
    $lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $securityConfig)
    $rightIndex = $lines.IndexOf(($lines | Where-Object { $_ -match '^SeServiceLogonRight\s*=' } | Select-Object -First 1))
    if ($rightIndex -ge 0) {
      if ($lines[$rightIndex] -notmatch [regex]::Escape($AccountSid)) {
        $lines[$rightIndex] = "$($lines[$rightIndex]),$AccountSid"
      }
    } else {
      $privilegeIndex = $lines.IndexOf('[Privilege Rights]')
      if ($privilegeIndex -lt 0) { throw 'A política exportada não contém [Privilege Rights].' }
      $lines.Insert($privilegeIndex + 1, "SeServiceLogonRight = $AccountSid")
    }
    $lines | Set-Content -LiteralPath $securityConfig -Encoding Unicode
    & secedit.exe /configure /db $securityDatabase /cfg $securityConfig /areas USER_RIGHTS /quiet | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível conceder o direito de logon como serviço.' }
  } finally {
    Remove-Item -LiteralPath $securityConfig, $securityDatabase -Force -ErrorAction SilentlyContinue
  }
}

Write-Step 'Validando a instalação publicada...'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este script em uma sessão elevada do PowerShell.'
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if (-not $service) { throw "Serviço $ServiceName não encontrado." }
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$serviceUser = Get-LocalUser -Name $ServiceAccount -ErrorAction Stop
$serviceSid = "*$($serviceUser.SID.Value)"
$localAccount = ".\$ServiceAccount"

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $InstallDirectory, $LogDirectory | Out-Null
$publishedEnvPath = Join-Path $InstallDirectory '.env'
if (-not (Test-Path -LiteralPath $publishedEnvPath -PathType Leaf)) {
  throw "Arquivo operacional não encontrado: $publishedEnvPath. Crie-o no diretório publicado antes de executar a publicação."
}
if ((Get-Service -Name $ServiceName -ErrorAction Stop).Status -ne 'Stopped') {
  Write-Step "Parando o serviço $ServiceName antes da atualização..."
  & sc.exe stop $ServiceName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível parar o serviço $ServiceName antes da atualização." }
  $stopDeadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $serviceState = (Get-Service -Name $ServiceName).Status
  } while ($serviceState -ne 'Stopped' -and (Get-Date) -lt $stopDeadline)
  if ($serviceState -ne 'Stopped') { throw "O serviço $ServiceName não parou no prazo esperado." }
}
Write-Step 'Copiando os arquivos da aplicação, preservando o .env operacional...'
& robocopy.exe $repositoryRoot $InstallDirectory /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 `
  /XF '.env' `
  /XD (Join-Path $repositoryRoot '.git') (Join-Path $repositoryRoot 'dist') (Join-Path $repositoryRoot 'node_modules') (Join-Path $repositoryRoot 'src-tauri\target') `
  (Join-Path $repositoryRoot 'backups') | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Falha ao publicar a API (robocopy $LASTEXITCODE)." }

Write-Step 'Instalando dependências Node.js na pasta operacional; isso pode levar alguns minutos...'
$npmInstall = Start-Process -FilePath $npmPath `
  -ArgumentList 'ci', '--no-audit', '--no-fund' `
  -WorkingDirectory $InstallDirectory -Wait -PassThru -NoNewWindow
if ($npmInstall.ExitCode -ne 0) {
  throw "A instalação das dependências publicadas falhou (código $($npmInstall.ExitCode))."
}
Write-Step 'Dependências instaladas.'

& icacls.exe $InstallDirectory /grant "$serviceSid`:(OI)(CI)(RX)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível conceder leitura da API publicada.' }
& icacls.exe $LogDirectory /grant "$serviceSid`:(OI)(CI)(M)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível conceder escrita dos logs.' }

$passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$newDatabasePassword = -join (1..40 | ForEach-Object {
  $passwordAlphabet[(Get-Random -Maximum $passwordAlphabet.Length)]
})
$escapedPassword = $newDatabasePassword.Replace('\', '\\').Replace("'", "\'")
$databaseSql = @"
CREATE USER IF NOT EXISTS 'pdv_app'@'127.0.0.1' IDENTIFIED BY '$escapedPassword';
ALTER USER 'pdv_app'@'127.0.0.1' IDENTIFIED BY '$escapedPassword';
CREATE USER IF NOT EXISTS 'pdv_app'@'localhost' IDENTIFIED BY '$escapedPassword';
ALTER USER 'pdv_app'@'localhost' IDENTIFIED BY '$escapedPassword';
"@
try {
  Write-Step 'Atualizando o usuário pdv_app no MariaDB...'
  if (-not (Test-Path -LiteralPath $DatabaseCredentialFile -PathType Leaf)) {
    throw "Arquivo temporário de credenciais do MariaDB não encontrado."
  }
  $databaseSql | & $mysqlPath "--defaults-extra-file=$DatabaseCredentialFile"
  if ($LASTEXITCODE -ne 0) { throw "A senha do usuário pdv_app não foi redefinida (código $LASTEXITCODE)." }
  Write-Step 'Usuário pdv_app atualizado.'
} finally {
  if ($temporaryDatabaseCredentialFile) {
    Remove-Item -LiteralPath $DatabaseCredentialFile -Force -ErrorAction SilentlyContinue
  }
}

$databasePassword = ConvertTo-SecureString $newDatabasePassword -AsPlainText -Force
$newDatabasePassword = $null
$servicePasswordText = -join (1..40 | ForEach-Object {
  $passwordAlphabet[(Get-Random -Maximum $passwordAlphabet.Length)]
})
$servicePassword = ConvertTo-SecureString $servicePasswordText -AsPlainText -Force
if (Get-LocalUser -Name $ServiceAccount -ErrorAction SilentlyContinue) {
  Write-Step "Atualizando a conta do serviço $ServiceAccount..."
  $setLocalUserArgs = @{
    Name = $ServiceAccount
    Password = $servicePassword
    PasswordNeverExpires = $true
    UserMayChangePassword = $false
  }
  Set-LocalUser @setLocalUserArgs
} else {
  Write-Step "Criando a conta do serviço $ServiceAccount..."
  $newLocalUserArgs = @{
    Name = $ServiceAccount
    Password = $servicePassword
    Description = 'Conta exclusiva do serviço da API do PDV.'
    PasswordNeverExpires = $true
    UserMayNotChangePassword = $true
  }
  New-LocalUser @newLocalUserArgs | Out-Null
}
$serviceUser = Get-LocalUser -Name $ServiceAccount -ErrorAction Stop
& net.exe user $ServiceAccount /passwordreq:yes | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Não foi possível exigir senha para a conta $ServiceAccount." }
Grant-ServiceLogonRight "*$($serviceUser.SID.Value)"

$plainDatabasePassword = [System.Net.NetworkCredential]::new('', $databasePassword).Password
$publishedEnvLines = @(Get-Content -LiteralPath $publishedEnvPath)
$publishedEnvPassword = $false
$publishedEnvLines = @(
  foreach ($line in $publishedEnvLines) {
    if ($line -match '^PDV_DB_PASSWORD=') {
      $publishedEnvPassword = $true
      "PDV_DB_PASSWORD=$plainDatabasePassword"
    } else {
      $line
    }
  }
  if (-not $publishedEnvPassword) {
    "PDV_DB_PASSWORD=$plainDatabasePassword"
  }
)
Set-Content -LiteralPath $publishedEnvPath -Value $publishedEnvLines -Encoding utf8
$bootstrapEnvPath = Join-Path $InstallDirectory ".pdv-bootstrap-$([guid]::NewGuid().ToString('N')).env"
$bootstrapOut = "$bootstrapEnvPath.out"
$bootstrapErr = "$bootstrapEnvPath.err"
try {
  Write-Step 'Provisionando a credencial do MariaDB no Windows Credential Manager...'
  "PDV_DB_PASSWORD=$plainDatabasePassword" | Set-Content -LiteralPath $bootstrapEnvPath -Encoding ASCII
  $bootstrap = Start-Process -FilePath $nodePath `
    -ArgumentList '--env-file=.env', "--env-file=$bootstrapEnvPath", 'scripts/set-database-credential.mjs' `
    -WorkingDirectory $InstallDirectory -Credential ([pscredential]::new($localAccount, $servicePassword)) `
    -LoadUserProfile `
    -RedirectStandardOutput $bootstrapOut -RedirectStandardError $bootstrapErr -Wait -PassThru -WindowStyle Hidden
  if ($bootstrap.ExitCode -ne 0) {
    $detail = Get-Content -LiteralPath $bootstrapErr -Raw -ErrorAction SilentlyContinue
    throw "O Credential Manager não foi provisionado (código $($bootstrap.ExitCode)): $detail"
  }
  Write-Step 'Credencial do MariaDB provisionada.'
} finally {
  Remove-Item -LiteralPath $bootstrapEnvPath, $bootstrapOut, $bootstrapErr -Force -ErrorAction SilentlyContinue
  $plainDatabasePassword = $null
  $databasePassword = $null
}

$winswXml = Join-Path $ServiceDirectory "$ServiceName.xml"
[xml]$xml = Get-Content -LiteralPath $winswXml -Raw
$xml.service.executable = $nodePath
$xml.service.arguments = '--env-file=.env scripts/run-api-service.mjs'
$xml.service.workingdirectory = $InstallDirectory
$logNode = $xml.service.SelectSingleNode('log')
if (-not $logNode) {
  $logNode = $xml.CreateElement('log')
  [void]$xml.service.AppendChild($logNode)
}
[void]$logNode.SetAttribute('mode', 'roll-by-time')
$patternNode = $logNode.SelectSingleNode('pattern')
if (-not $patternNode) {
  $patternNode = $xml.CreateElement('pattern')
  [void]$logNode.AppendChild($patternNode)
}
$patternNode.InnerText = 'yyyyMMdd'
$keepFilesNode = $logNode.SelectSingleNode('keepFiles')
if (-not $keepFilesNode) {
  $keepFilesNode = $xml.CreateElement('keepFiles')
  [void]$logNode.AppendChild($keepFilesNode)
}
$keepFilesNode.InnerText = '14'
$errorLogPath = [System.Security.SecurityElement]::Escape((Join-Path $LogDirectory 'api-startup.error.log'))
$errorLogNode = $xml.service.SelectSingleNode("env[@name='PDV_SERVICE_ERROR_LOG']")
if (-not $errorLogNode) {
  $errorLogNode = $xml.CreateElement('env')
  [void]$errorLogNode.SetAttribute('name', 'PDV_SERVICE_ERROR_LOG')
  [void]$xml.service.AppendChild($errorLogNode)
}
[void]$errorLogNode.SetAttribute('value', $errorLogPath)
$serviceAccountNode = $xml.service.SelectSingleNode('serviceaccount')
if ($serviceAccountNode) {
  [void]$xml.service.RemoveChild($serviceAccountNode)
}
$xml.Save($winswXml)
Write-Step 'Configurando a conta e reiniciando o serviço...'
$winswPath = Join-Path $ServiceDirectory "$ServiceName.exe"
& $winswPath stop | Out-Null
& $winswPath uninstall | Out-Null
& $winswPath install | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível reinstalar o wrapper com a configuração atualizada.' }
& sc.exe config $ServiceName obj= $localAccount password= $servicePasswordText | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar a conta do serviço.' }
$servicePasswordText = $null

& sc.exe stop $ServiceName | Out-Null
Start-Sleep -Seconds 3
& sc.exe start $ServiceName | Out-Null
Start-Sleep -Seconds 10
$state = (Get-Service -Name $ServiceName).Status
if ($state -ne 'Running') { throw "O serviço não iniciou. Estado atual: $state." }

Write-Step "Serviço $ServiceName publicado em $InstallDirectory e executando como $localAccount."
} finally {
  if ($temporaryDatabaseCredentialFile) {
    Remove-Item -LiteralPath $DatabaseCredentialFile -Force -ErrorAction SilentlyContinue
  }
  $rootPassword = $null
  $rootPasswordSecure = $null
}
