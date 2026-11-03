import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("publicação preserva o .env operacional e exige sua existência", async () => {
  const script = await readFile("scripts/publish-windows-api-service.ps1", "utf8");
  assert.match(script, /publishedEnvPath/u);
  assert.match(script, /Test-Path -LiteralPath \$publishedEnvPath -PathType Leaf/u);
  assert.match(script, /\/XF '\.env'/u);
  assert.match(script, /\[string\]\$DatabaseCredentialFile/u);
  assert.match(script, /Read-Host 'Senha do usuário administrativo do MariaDB' -AsSecureString/u);
  assert.match(script, /\$temporaryDatabaseCredentialFile = \$false[\s\S]*?Read-Host 'Senha do usuário administrativo do MariaDB'/u);
  assert.ok(
    script.indexOf("Read-Host 'Senha do usuário administrativo do MariaDB'") <
      script.indexOf("robocopy.exe"),
    "a senha deve ser solicitada antes da cópia da aplicação"
  );
  assert.match(script, /defaults-extra-file=\$DatabaseCredentialFile/u);
  assert.match(script, /Join-Path \$repositoryRoot 'node_modules'/u);
  assert.match(script, /WorkingDirectory \$InstallDirectory/u);
  assert.match(script, /ArgumentList 'ci', '--no-audit', '--no-fund'/u);
  assert.match(script, /Write-Step 'Instalando dependências Node\.js/u);
  assert.match(script, /Write-Step 'Provisionando a credencial/u);
  assert.match(script, /scripts\/run-api-service\.mjs/u);
  assert.match(script, /winswPath.*ServiceDirectory/u);
  assert.match(script, /Grant-ServiceLogonRight/u);
  assert.match(script, /SeServiceLogonRight/u);
  assert.match(script, /passwordreq:yes/u);
});

test("serviço publicado usa launcher para registrar falhas de inicialização", async () => {
  const script = await readFile("scripts/install-windows-service.ps1", "utf8");
  assert.match(script, /scripts\/run-api-service\.mjs/u);
  assert.match(script, /PDV_SERVICE_ERROR_LOG/u);
});
