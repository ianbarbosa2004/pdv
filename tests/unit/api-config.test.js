import test from "node:test";
import assert from "node:assert/strict";

const storage = new Map();

global.window = {
  location: {
    hostname: "127.0.0.1",
    protocol: "http:"
  }
};
global.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

test("persiste o tema no armazenamento do navegador em desenvolvimento", async () => {
  const moduleUrl = new URL("../../src/shared/api.js", import.meta.url);
  const api = await import(`${moduleUrl.href}?theme-test=${Date.now()}`);

  await api.loadConfiguredApiUrl();
  await api.saveConfiguredTheme("dos");

  assert.deepEqual(
    JSON.parse(storage.get("pdv.offline-config")),
    { theme: "dos" }
  );

  const reloadedApi = await import(`${moduleUrl.href}?theme-test-reload=${Date.now()}`);
  await reloadedApi.loadConfiguredApiUrl();
  assert.equal(await reloadedApi.getConfiguredTheme(), "dos");
});
