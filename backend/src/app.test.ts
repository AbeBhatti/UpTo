import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { ROUTES } from "@upto/contracts";
import { createApp } from "./app.js";
import type { AppDeps } from "./deps.js";

const emptyDb = new Proxy({}, {
  get: (_target, model: string) => new Proxy({}, {
    get: (_model, method: string) => async () => {
      if (method === "findMany") return [];
      if (method === "count") return 0;
      if (method === "findUnique" || method === "findFirst") return null;
      throw new Error(`Unexpected fake database call: ${model}.${method}`);
    },
  }),
});

const now = () => new Date("2026-01-01T12:00:00.000Z");
const fakeDeps = {
  auth: { db: emptyDb, now },
  verification: {
    db: emptyDb,
    now,
    deliverCode: async () => undefined,
    currentUserId: () => null,
    startSession: () => undefined,
  },
  events: { db: emptyDb, now, currentUserId: () => null },
  uptos: { db: emptyDb, now, currentUserId: () => null },
  drops: { db: emptyDb, now, currentUserId: () => null },
  chat: { db: emptyDb, now, currentUserId: () => null },
  admin: { db: emptyDb, now, currentUserId: () => null },
} as unknown as AppDeps;

const app = createApp(fakeDeps);
const server = createServer(app);
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

test("implemented routes use their routers and unimplemented routes stay stubbed", async () => {
  const served = app.locals.servedRouteDefinitions as Set<string>;
  assert.equal(served.size, 36);

  const eventsResponse = await fetch(`${baseUrl}/events`);
  assert.equal(eventsResponse.status, 200);
  assert.deepEqual(await eventsResponse.json(), {
    ok: true,
    data: { events: [], counts: { all: 0, free_food: 0, clubs: 0, active: 0, career: 0 }, nextCursor: null },
  });

  const meResponse = await fetch(`${baseUrl}/auth/me`);
  assert.equal(meResponse.status, 401);

  for (const [routeKey, definition] of Object.entries(ROUTES)) {
    const [method, routePath] = definition.split(" ", 2);
    const path = routePath.replace(/:[^/]+/g, "x");
    const response = await fetch(`${baseUrl}${path}`, { method });
    if (served.has(definition)) {
      assert.notEqual(response.status, 501, `${definition} must reach its router`);
      const body = await response.json() as { ok?: unknown };
      assert.equal(typeof body.ok, "boolean", `${definition} should return an API envelope`);
    } else {
      assert.equal(response.status, 501, `${definition} status`);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: { code: "server_error", message: `${routeKey} is not implemented yet` },
      });
    }
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
