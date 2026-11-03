param(
  [string]$ServiceName = 'PDV-API',
  [string]$ServiceAccount = 'PDVApiSvc',
  [string]$LogDirectory = 'C:\ProgramData\PDV\logs'
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este script em uma sessão elevada do PowerShell.'
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if (-not $service) {
  throw "Serviço $ServiceName não encontrado."
}

$rootPasswordNotice = 'A senha do root será solicitada pelo cliente mysql em seguida.'
Write-Output $rootPasswordNotice
$passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$newDatabasePassword = -join (1..40 | ForEach-Object {
  $passwordAlphabet[(Get-Random -Maximum $passwordAlphabet.Length)]
})
$escapedDatabasePassword = $newDatabasePassword.Replace('\', '\\').Replace("'", "\'")
$databaseSql = @"
CREATE USER IF NOT EXISTS 'pdv_app'@'127.0.0.1' IDENTIFIED BY '$escapedDatabasePassword';
ALTER USER 'pdv_app'@'127.0.0.1' IDENTIFIED BY '$escapedDatabasePassword';
CREATE USER IF NOT EXISTS 'pdv_app'@'localhost' IDENTIFIED BY '$escapedDatabasePassword';
ALTER USER 'pdv_app'@'localhost' IDENTIFIED BY '$escapedDatabasePassword';
"@

$mysqlCommand = Get-Command mysql.exe -ErrorAction SilentlyContinue
if (-not $mysqlCommand) {
  $mysqlPath = @(
    'C:\Program Files\MariaDB 13.0\bin\mysql.exe',
    'C:\Program Files\MariaDB 11.4\bin\mysql.exe',
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($mysqlPath) {
    $mysqlCommand = Get-Item -LiteralPath $mysqlPath
  }
}
if (-not $mysqlCommand) {
  throw 'mysql.exe não foi encontrado no PATH.'
}
$mysqlExecutable = if ($mysqlCommand.PSObject.Properties.Name -contains 'Source') {
  $mysqlCommand.Source
} else {
  $mysqlCommand.FullName
}
$databaseSql | & $mysqlExecutable --user=root --password --host=127.0.0.1 --port=3306
if ($LASTEXITCODE -ne 0) {
  throw "A redefinição da senha do usuário pdv_app falhou (código $LASTEXITCODE)."
}

$databasePassword = ConvertTo-SecureString $newDatabasePassword -AsPlainText -Force
$newDatabasePassword = $null
$servicePasswordText = -join (1..40 | ForEach-Object {
  $passwordAlphabet[(Get-Random -Maximum $passwordAlphabet.Length)]
})
$servicePassword = ConvertTo-SecureString $servicePasswordText -AsPlainText -Force

$existingUser = Get-LocalUser -Name $ServiceAccount -ErrorAction SilentlyContinue
if ($existingUser) {
  $setLocalUserArgs = @{
    Name = $ServiceAccount
    Password = $servicePassword
    PasswordNeverExpires = $true
    UserMayChangePassword = $false
  }
  Set-LocalUser @setLocalUserArgs
} else {
  $newLocalUserArgs = @{
    Name = $ServiceAccount
    Password = $servicePassword
    Description = 'Conta exclusiva do serviço da API do PDV.'
    PasswordNeverExpires = $true
    UserMayNotChangePassword = $true
  }
  New-LocalUser @newLocalUserArgs | Out-Null
}

$localAccount = ".\$ServiceAccount"
$serviceUser = Get-LocalUser -Name $ServiceAccount -ErrorAction Stop
$localAccountSid = "*$($serviceUser.SID.Value)"
$parentPath = Split-Path $repositoryRoot -Parent
while ($parentPath -and $parentPath -ne [System.IO.Path]::GetPathRoot($parentPath)) {
  & icacls.exe $parentPath /grant "$localAccountSid`:(RX)" /C | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível conceder travessia ao diretório $parentPath."
  }
  $parentPath = Split-Path $parentPath -Parent
}
& icacls.exe $repositoryRoot /grant "$localAccountSid`:(OI)(CI)(RX)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível conceder leitura do checkout à conta $ServiceAccount."
}
New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
& icacls.exe $LogDirectory /grant "$localAccountSid`:(OI)(CI)(M)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível conceder escrita dos logs à conta $ServiceAccount."
}

$credential = New-Object System.Management.Automation.PSCredential(".\$ServiceAccount", $servicePassword)
$plainDatabasePassword = [System.Net.NetworkCredential]::new('', $databasePassword).Password
$bootstrapEnvPath = Join-Path $repositoryRoot ".pdv-bootstrap-$([guid]::NewGuid().ToString('N')).env"
try {
  "PDV_DB_PASSWORD=$plainDatabasePassword" | Set-Content -LiteralPath $bootstrapEnvPath -Encoding ASCII
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $bootstrap = Start-Process -FilePath $nodePath `
    -ArgumentList "--env-file=$bootstrapEnvPath", 'scripts/set-database-credential.mjs' `
    -WorkingDirectory $repositoryRoot `
    -Credential $credential `
    -RedirectStandardOutput "$bootstrapEnvPath.out" `
    -RedirectStandardError "$bootstrapEnvPath.err" `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
  if ($bootstrap.ExitCode -ne 0) {
    $bootstrapError = Get-Content -LiteralPath "$bootstrapEnvPath.err" -Raw -ErrorAction SilentlyContinue
    throw "O provisionamento do Credential Manager retornou código $($bootstrap.ExitCode): $bootstrapError"
  }
} finally {
  Remove-Item -LiteralPath $bootstrapEnvPath, "$bootstrapEnvPath.out", "$bootstrapEnvPath.err" -Force -ErrorAction SilentlyContinue
  $plainDatabasePassword = $null
  $databasePassword = $null
}

$servicePasswordText = [System.Net.NetworkCredential]::new('', $servicePassword).Password
try {
  & sc.exe config $ServiceName obj= ".\$ServiceAccount" password= $servicePasswordText | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível configurar a conta do serviço."
  }
} finally {
  $servicePasswordText = $null
}

& sc.exe stop $ServiceName | Out-Null
Start-Sleep -Seconds 2
& sc.exe start $ServiceName | Out-Null
Start-Sleep -Seconds 8
$state = (Get-Service -Name $ServiceName).Status
if ($state -ne 'Running') {
  throw "O serviço $ServiceName não iniciou. Estado atual: $state."
}

Write-Output "Serviço $ServiceName configurado para executar como .\$ServiceAccount e iniciado."



