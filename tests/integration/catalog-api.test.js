import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 32000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

const startApi = () => {
  const child = spawn(
    process.execPath,
    ["src/server/server.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PDV_API_HOST: "127.0.0.1",
        PDV_API_PORT: String(port),
        PDV_DB_HOST: "127.0.0.1",
        PDV_DB_PORT: "3306",
        PDV_DB_NAME: "pdv",
        PDV_DB_USER: "pdv_app",
        PDV_DB_PASSWORD: "test",
        PDV_API_TOKEN: "test-api-token"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  return child;
};

const waitForApi = async (child) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("A API encerrou antes de ficar disponível.");
    }
    try {
      await fetch(`${baseUrl}/api/health`, { headers: { Authorization: "Bearer test-api-token" } });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("A API não ficou disponível a tempo.");
};

test("protege a API e libera CORS somente para a origem configurada", async (t) => {
  const api = startApi();
  t.after(() => api.kill());

  await waitForApi(api);

  const preflight = await fetch(`${baseUrl}/api/classes`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:5173",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-methods"), /PUT/);
  assert.match(preflight.headers.get("access-control-allow-methods"), /DELETE/);

  const unauthenticated = await fetch(`${baseUrl}/api/classes`);
  assert.equal(unauthenticated.status, 401);

  for (const path of ["/api/navigation/menus", "/api/navigation/items"]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-token" },
      body: "{}"
    });
    assert.equal(response.status, 405, `${path} não deve permitir novas criações`);
  }

  for (const [method, path] of [
    ["PUT", "/api/classes"],
    ["PUT", "/api/classes/status"],
    ["DELETE", "/api/classes"],
    ["PUT", "/api/groups"],
    ["PUT", "/api/groups/status"],
    ["DELETE", "/api/groups"],
    ["PUT", "/api/products"],
    ["POST", "/api/products/import"],
    ["PUT", "/api/products/status"],
    ["DELETE", "/api/products"],
    ["POST", "/api/fiscal-operations"],
    ["PUT", "/api/fiscal-operations"],
    ["DELETE", "/api/fiscal-operations"],
    ["POST", "/api/fiscal-catalogs"],
    ["PUT", "/api/fiscal-catalogs"],
    ["DELETE", "/api/fiscal-catalogs"],
    ["POST", "/api/suppliers"],
    ["PUT", "/api/suppliers"],
    ["PUT", "/api/suppliers/status"],
    ["DELETE", "/api/suppliers"]
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-token" },
      body: "{}"
    });
    assert.equal(response.status, 400, `${method} ${path} deve validar o payload`);
  }
});
