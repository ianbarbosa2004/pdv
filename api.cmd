@echo off
setlocal

echo Parando o servico PDV-API...
net stop PDV-API
if errorlevel 2 (
  echo O servico PDV-API ja estava parado ou nao pode ser parado.
)

echo Iniciando o servico PDV-API publicado...
net start PDV-API
if errorlevel 1 (
  echo Falha ao iniciar o servico PDV-API.
  exit /b 1
)

echo.
sc.exe query PDV-API
exit /b 0