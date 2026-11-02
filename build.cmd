@echo off
setlocal

cd /d "%~dp0"

if not exist ".env" (
    echo Erro: arquivo .env nao encontrado.
    exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "PDV_API_TOKEN=" ".env"`) do (
    if "%%A"=="PDV_API_TOKEN" set "VITE_PDV_API_TOKEN=%%B"
)

if not defined VITE_PDV_API_TOKEN (
    echo Erro: PDV_API_TOKEN nao configurado no .env.
    exit /b 1
)

set "PDV_API_URL=http://192.168.1.200:3000"

echo Gerando bundles...
REM call npm.cmd run release:client -refresh-icons
call npm.cmd run release:client

if errorlevel 1 (
    echo Falha ao gerar os bundles.
    exit /b 1
)

echo Bundles gerados em dist\releases.
endlocal