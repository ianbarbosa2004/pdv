import test from "node:test";
import assert from "node:assert/strict";
import {
  createOperatorSessionToken,
  hashOperatorPassword,
  hashOperatorSessionToken,
  normalizeOperatorUsername,
  verifyOperatorPassword
} from "../../src/server/operator-service.js";

test("hashes and verifies operator passwords without storing plaintext", () => {
  const encoded = hashOperatorPassword("Senha segura 123");
  assert.notEqual(encoded, "Senha segura 123");
  assert.equal(verifyOperatorPassword("Senha segura 123", encoded), true);
  assert.equal(verifyOperatorPassword("Senha errada 123", encoded), false);
});

test("normalizes usernames and hashes session tokens deterministically", () => {
  assert.equal(normalizeOperatorUsername("  CAIXA.01 "), "caixa.01");
  const token = createOperatorSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(hashOperatorSessionToken(token), hashOperatorSessionToken(token));
});

