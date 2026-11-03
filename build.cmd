@echo off
setlocal

cd /d "%~dp0"

if not exist "C:\ProgramData\PDV\app\.env" (
    echo Erro: instalacao operacional da API nao encontrada em C:\ProgramData\PDV\app.
    exit /b 1
)

set "PDV_API_URL=http://192.168.1.200:3000"

echo Gerando bundles...
REM call npm.cmd run release:client -- --refresh-icons
call npm.cmd run release:client

if errorlevel 1 (
    echo Falha ao gerar os bundles.
    exit /b 1
)

echo Bundles gerados em dist\releases.
endlocal