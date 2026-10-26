import test from "node:test";
import assert from "node:assert/strict";
import { parseCestPayload, parseNcmPayload } from "../src/server/ncm-cest-update.js";

test("interpreta somente códigos NCM de oito dígitos da fonte oficial", () => {
  const result = parseNcmPayload({
    Nomenclaturas: [
      { Codigo: "01", Descricao: "Grupo" },
      { Codigo: "0101.21.00", Descricao: "Cavalos" },
      { Codigo: "0101.29.00", Descricao: "Outros" }
    ]
  });
  assert.deepEqual(result, [
    { codeNcm: "01012100", descriptionNcm: "Cavalos" },
    { codeNcm: "01012900", descriptionNcm: "Outros" }
  ]);
});

test("interpreta CEST, segmento e relação NCM em CSV", () => {
  const result = parseCestPayload(
    "Segmento;Item;CEST;NCM/SH;Descrição\n" +
      "Animais;1.0;01.001.00;0101.21.00;Mercadoria de teste\n"
  );
  assert.deepEqual(result.items, [
    { codeCest: "0100100", descriptionCest: "Mercadoria de teste", segmentCest: "Animais" }
  ]);
  assert.deepEqual(result.relations, [{ codeNcm: "01012100", codeCest: "0100100" }]);
});
