import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("publicação preserva o .env operacional e exige sua existência", async () => {
  const script = await readFile("scripts/publish-windows-api-service.ps1", "utf8");
  assert.match(script, /publishedEnvPath/u);
  assert.match(script, /Test-Path -LiteralPath \$publishedEnvPath -PathType Leaf/u);
  assert.match(script, /\/XF '\.env'/u);
  assert.match(script, /\[string\]\$DatabaseCredentialFile/u);
  assert.match(script, /Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'/u);
  assert.match(script, /ConsoleKey\]::Enter/u);
  assert.match(script, /ConsoleKey\]::Backspace/u);
  assert.match(script, /cole com Ctrl\+V ou botão direito/u);
});

test("valida a senha do MariaDB imediatamente após a entrada", async () => {
  const script = await readFile("scripts/publish-windows-api-service.ps1", "utf8");
  const passwordPrompt = script.indexOf("Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'");
  const credentialTest = script.indexOf("Test-MariaDbCredential $mysqlPath $DatabaseCredentialFile");
  const firstSlowStep = script.indexOf("Write-Step 'Validando a instalação publicada...'");
  const copyStep = script.indexOf("Write-Step 'Copiando os arquivos da aplicação");
  assert.ok(passwordPrompt >= 0);
  assert.ok(credentialTest > passwordPrompt);
  assert.ok(credentialTest < firstSlowStep);
  assert.ok(credentialTest < copyStep);
  assert.match(script, /--execute=SELECT 1;/u);
  assert.match(script, /\$temporaryDatabaseCredentialFile = \$false[\s\S]*?Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'/u);
  assert.ok(
    script.indexOf("Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'") <
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
  assert.match(script, /-Credential \(\[pscredential\]::new\(\$localAccount, \$servicePassword\)\)[\s\S]*?-LoadUserProfile/u);
  assert.match(script, /-ArgumentList '--env-file=\.env', "--env-file=\$bootstrapEnvPath", 'scripts\/set-database-credential\.mjs'/u);
  assert.match(script, /PDV_DB_PASSWORD=\$plainDatabasePassword/u);
});

test("scripts de senha permitem colar sem expor os caracteres", async () => {
  const [installScript, configureScript] = await Promise.all([
    readFile("scripts/install-windows-api.ps1", "utf8"),
    readFile("scripts/configure-windows-service-account.ps1", "utf8")
  ]);
  for (const script of [installScript, configureScript]) {
    assert.match(script, /function Read-MariaDbPassword/u);
    assert.match(script, /ConsoleKey\]::Enter/u);
    assert.match(script, /Write-Host '\*' -NoNewline/u);
    assert.doesNotMatch(script, /--password/u);
    assert.doesNotMatch(script, /Read-Host .*AsSecureString/u);
  }
  assert.match(configureScript, /defaults-extra-file=\$rootCredentialFile/u);
});

test("migrações aceitam Ctrl+V no prompt mascarado", async () => {
  const config = await readFile("src/server/config.js", "utf8");
  const migration = await readFile("scripts/migrations/migrate-uppercase-data.mjs", "utf8");
  assert.match(config, /execFileSync/u);
  assert.match(config, /Get-Clipboard -Raw/u);
  assert.match(config, /character === "\\u0016"/u);
  assert.match(config, /process\.stdout\.write\("\*"\)/u);
  assert.doesNotMatch(config, /console\.log\(.*password/iu);
  assert.match(migration, /loadMigrationConfig/u);
  assert.doesNotMatch(migration, /getConfig/u);
});

test("migração de capitalização cobre configurações da empresa e locais de impressão", async () => {
  const migration = await readFile("scripts/migrations/migrate-uppercase-data.mjs", "utf8");
  assert.match(migration, /\["groups", \["descriptionGroup"\]\]/u);
  assert.match(migration, /\["units", \["codeUnit", "descriptionUnit"\]\]/u);
  assert.match(migration, /units\.codeUnit/u);
  assert.match(migration, /\["products", \["nameProduct", "skuProduct", "printsPlace"\]\]/u);
  assert.match(migration, /\["company_settings", \[[\s\S]*"corporateNameCompany"[\s\S]*"cityCompany"/u);
});

test("serviço publicado usa launcher para registrar falhas de inicialização", async () => {
  const script = await readFile("scripts/install-windows-service.ps1", "utf8");
  assert.match(script, /scripts\/run-api-service\.mjs/u);
  assert.match(script, /PDV_SERVICE_ERROR_LOG/u);
});

test("provisionamento legado do serviço carrega o perfil da conta antes do Credential Manager", async () => {
  const script = await readFile("scripts/configure-windows-service-account.ps1", "utf8");
  assert.match(script, /-Credential \$credential[\s\S]*?-LoadUserProfile/u);
  assert.match(script, /-ArgumentList '--env-file=\.env', "--env-file=\$bootstrapEnvPath", 'scripts\/set-database-credential\.mjs'/u);
  assert.match(script, /PDV_DB_PASSWORD=\$plainDatabasePassword/u);
});
