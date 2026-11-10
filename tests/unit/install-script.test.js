import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("instalação limpa solicita a senha sem aceitar credencial por ambiente", async () => {
  const script = await readFile("scripts/install-windows-api.ps1", "utf8");
  assert.match(script, /Read-MariaDbPassword 'Senha do usuário administrativo do MariaDB'/u);
  assert.match(script, /ConsoleKey\]::Enter/u);
  assert.match(script, /cole com Ctrl\+V ou botão direito/u);
  assert.doesNotMatch(script, /PDV_DB_ROOT_PASSWORD/u);
  assert.match(script, /RandomNumberGenerator/u);
  assert.match(script, /PDV_API_TOKEN=\$apiToken/u);
  assert.match(script, /Set-Content -LiteralPath \$publishedEnvPath/u);
  assert.match(script, /defaults-extra-file/u);
  assert.match(script, /-DatabaseCredentialFile \$rootCredentialFile/u);
  assert.match(script, /Remove-Item -LiteralPath \$rootCredentialFile/u);
  assert.match(script, /-ApplicationDirectory \$InstallDirectory -SkipStart/u);
  assert.match(script, /Write-Step 'Preparando banco de dados/u);
  assert.match(script, /Write-Step 'Publicando a aplicação/u);
  assert.match(script, /\[Console\]::OutputEncoding/u);
  assert.doesNotMatch(script, /WorkingDirectory \$repositoryRoot[\s\S]{0,180}ArgumentList 'ci'/u);
  assert.doesNotMatch(script, /--password\s*['"]?\s*$/mu);
});
