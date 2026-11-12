import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithTimeout } from "../../src/shared/request-timeout.js";

test("interrompe uma requisição que permanece pendente", async () => {
  await assert.rejects(
    fetchWithTimeout(() => new Promise(() => {}), 10),
    /Tempo limite da requisição/u
  );
});
