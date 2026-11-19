$logDirectory = if ($env:PDV_LOG_DIR) { $env:PDV_LOG_DIR } else { "C:\ProgramData\PDV\logs" }
$logFile = Join-Path $logDirectory "pdv-cargo.log"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
npm.cmd run tauri -- dev 2>&1 | Tee-Object -FilePath $logFile
exit $LASTEXITCODE
