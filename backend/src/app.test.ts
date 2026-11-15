import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { ROUTES } from "@upto/contracts";
import { createApp } from "./app.js";

const server = createServer(createApp());
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("GET /health returns the healthy envelope", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { status: "ok" } });
});

test("every contract route returns its 501 stub envelope", async () => {
  for (const [routeKey, definition] of Object.entries(ROUTES)) {
    const [method, routePath] = definition.split(" ", 2);
    const path = routePath.replace(/:[^/]+/g, "x");
    const response = await fetch(`${baseUrl}${path}`, { method });
    assert.equal(response.status, 501, `${definition} status`);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: "server_error", message: `${routeKey} is not implemented yet` },
    });
  }
});

test("unknown paths return the not found envelope", async () => {
  const response = await fetch(`${baseUrl}/this-path-does-not-exist`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { code: "not_found", message: "Route not found" },
  });
});
