import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desinstalação completa remove arquivos e credenciais, mas preserva o banco", async () => {
  const script = await readFile("scripts/uninstall-windows-service.ps1", "utf8");
  assert.match(script, /ApplicationDirectory/u);
  assert.match(script, /LogDirectory/u);
  assert.match(script, /remove-database-credential\.mjs/u);
  assert.match(script, /Remove-Item -LiteralPath \$path -Recurse -Force/u);
  assert.match(script, /PdvRoot = 'C:\\ProgramData\\PDV'/u);
  assert.match(script, /remainingEntries = Get-ChildItem -LiteralPath \$PdvRoot/u);
  assert.match(script, /Remove-Item -LiteralPath \$PdvRoot -Force/u);
  assert.match(script, /Remove-LocalUser -Name \$ServiceAccount/u);
  assert.doesNotMatch(script, /DROP\s+DATABASE|Remove-Item[\s\S]{0,80}MariaDB/u);
  assert.match(script, /Banco de dados MariaDB preservado/u);
});
