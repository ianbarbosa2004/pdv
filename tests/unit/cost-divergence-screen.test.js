import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("confirma o custo persistido e exibe sucesso sem fechar a tela", async () => {
  const source = await readFile(
    new URL("../../src/tools/cost-divergence-screen.js", import.meta.url),
    "utf8"
  );
  const serverSource = await readFile(
    new URL("../../src/server/server.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /renderSuccessFeedback\(message, escapeHtml\)/u);
  assert.match(source, /payload\.costPriceProduct/u);
  assert.match(source, /Number\(selectedProduct\.suggestedCostPriceProduct \?\? 0\)\.toFixed\(2\)/u);
  assert.match(source, /Preço de custo atualizado com sucesso/u);
  assert.match(serverSource, /SELECT idProduct, costPriceProduct FROM products/u);
  assert.match(serverSource, /costPriceProduct: updatedProducts\[0\]\.costPriceProduct/u);
  assert.match(serverSource, /ROUND\(COALESCE\(products\.costPriceProduct, 0\), 2\)[\s\S]*ROUND\(COALESCE\(formations\.unitCostFormation, 0\), 2\)/u);
});
