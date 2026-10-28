param(
  [string]$InstallDirectory = 'C:\ProgramData\PDV\service',
  [string]$LogDirectory = 'C:\ProgramData\PDV\logs',
  [string]$ServiceName = 'PDV-API'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$winswPath = Join-Path $InstallDirectory "$ServiceName.exe"
$configPath = Join-Path $InstallDirectory "$ServiceName.xml"
$winswVersion = 'v2.12.0'
$winswSha256 = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'

if (-not (Test-Path (Join-Path $repositoryRoot '.env'))) {
  throw "Arquivo .env não encontrado em $repositoryRoot."
}

$runningApiProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match '--env-file=\.env.*src\\server\\server\.js'
  }
foreach ($process in $runningApiProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}

$mariaDbService = Get-Service -Name 'MariaDB' -ErrorAction SilentlyContinue
if (-not $mariaDbService) {
  throw "O serviço MariaDB não foi encontrado. Instale e configure o banco antes."
}

New-Item -ItemType Directory -Force -Path $InstallDirectory, $LogDirectory | Out-Null
& icacls.exe $repositoryRoot /grant '*S-1-5-19:(OI)(CI)(RX)' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível conceder leitura do checkout à conta LocalService."
}
$parentPath = Split-Path $repositoryRoot -Parent
while ($parentPath -and $parentPath -ne [System.IO.Path]::GetPathRoot($parentPath)) {
  & icacls.exe $parentPath /grant '*S-1-5-19:(RX)' /C | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível conceder travessia ao diretório $parentPath."
  }
  $parentPath = Split-Path $parentPath -Parent
}
& icacls.exe $LogDirectory /grant '*S-1-5-19:(OI)(CI)(M)' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível conceder escrita dos logs à conta LocalService."
}

if (-not (Test-Path $winswPath)) {
  $downloadUrl = "https://github.com/winsw/winsw/releases/download/$winswVersion/WinSW-x64.exe"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $winswPath
}

$actualHash = (Get-FileHash $winswPath -Algorithm SHA256).Hash
if ($actualHash -ne $winswSha256) {
  throw "Hash inesperado para WinSW $winswVersion. Esperado $winswSha256, obtido $actualHash."
}

$escapedRoot = [System.Security.SecurityElement]::Escape($repositoryRoot)
$escapedNode = [System.Security.SecurityElement]::Escape($nodePath)
$escapedLog = [System.Security.SecurityElement]::Escape($LogDirectory)
$config = @"
<service>
  <id>$ServiceName</id>
  <name>PDV API</name>
  <description>API Node.js do sistema PDV da loja.</description>
  <executable>$escapedNode</executable>
  <arguments>--env-file=.env src/server/server.js</arguments>
  <workingdirectory>$escapedRoot</workingdirectory>
  <stoptimeout>15sec</stoptimeout>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <depend>MariaDB</depend>
  <logpath>$escapedLog</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
    <keepFiles>14</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 day</resetfailure>
  <serviceaccount>LocalService</serviceaccount>
</service>
"@

Set-Content -Path $configPath -Value $config -Encoding UTF8

& $winswPath stop
& $winswPath uninstall
& $winswPath install
$serviceAccountCommand = 'sc.exe config {0} obj= "NT AUTHORITY\LocalService"' -f $ServiceName
& cmd.exe /c $serviceAccountCommand
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível configurar a conta LocalService para o serviço."
}
& $winswPath start

Start-Sleep -Seconds 5
$service = Get-Service -Name $ServiceName -ErrorAction Stop
if ($service.Status -ne 'Running') {
  throw "O serviço $ServiceName não iniciou. Estado atual: $($service.Status)."
}

Write-Output "Serviço $ServiceName instalado e em execução."
Write-Output "Checkout: $repositoryRoot"
Write-Output "Logs: $LogDirectory"
