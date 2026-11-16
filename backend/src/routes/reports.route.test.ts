/**
 * POST /uptos/:id/report and POST /drops/:id/report over HTTP, against both
 * real routers on one app backed by the in-memory ContentFakeDb.
 *
 * Reports are one Report table with a targetType discriminator; the responses
 * must narrow it into the class diagram's UpToReport and DropReport, and each
 * stored row must have exactly one target id set.
 *
 *   npx tsx --test --test-reporter=spec src/routes/reports.route.test.ts
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, describe, test } from "node:test";
import express from "express";
import { ME, NOW, PEOPLE } from "@upto/fixtures";
import type { DropsDeps } from "../controllers/drops.controller.js";
import type { UpTosDeps } from "../controllers/uptos.controller.js";
import { DROP_LIFETIME_MS } from "../services/drops/drops.js";
import { contentDb as db } from "../services/uptos/fakeDb.js";
import { dropsRouter } from "./drops.route.js";
import { uptosRouter } from "./uptos.route.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const now = () => new Date(NOW);
db.clock = now;

const currentUserId = (request: express.Request) => request.header("x-user-id") ?? null;
const app = express();
app.use(express.json());
app.use(uptosRouter({ db: db as unknown as UpTosDeps["db"], now, currentUserId }));
app.use(dropsRouter({ db: db as unknown as DropsDeps["db"], now, currentUserId }));

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

const LIZ = PEOPLE[1]!;

beforeEach(() => {
  db.reset();
  for (const person of PEOPLE) db.insert("user", { ...person });
  db.insert("upTo", {
    id: "upt_boba",
    creatorId: LIZ.id,
    title: "Boba run",
    scheduledAt: new Date("2026-11-16T02:00:00.000Z"),
    location: "Benson",
    shareSlug: "k3f9qz",
    published: true,
  });
  db.insert("upTo", {
    id: "upt_draft",
    creatorId: LIZ.id,
    title: "Draft",
    scheduledAt: new Date("2026-11-16T02:00:00.000Z"),
    location: "Benson",
    shareSlug: "dr4ft2",
    published: false,
  });
  const drop = { authorId: LIZ.id, category: "FREE_FOOD", text: "Pizza in Benson", lat: 37.3487, lng: -121.9385 };
  db.insert("drop", { ...drop, id: "drp_live", expiresAt: new Date(Date.parse(NOW) + DROP_LIFETIME_MS) });
  db.insert("drop", { ...drop, id: "drp_old", expiresAt: new Date(Date.parse(NOW) - 60_000) });
});

interface ReplyOf {
  status: number;
  body: any;
}

async function post(path: string, body: unknown, as: string | null = ME.id): Promise<ReplyOf> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (as) headers["x-user-id"] = as;
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const BASE_KEYS = ["id", "reporter", "reason", "details", "createdAt", "resolvedAt", "targetType"];

/** Exactly one of the three target ids is set on every stored report. */
function assertOneTarget(): void {
  for (const row of db.tables.report) {
    const set = ["dropId", "upToId", "messageId"].filter((column) => row[column] !== null);
    assert.equal(set.length, 1, `report ${row.id} has targets ${set.join(", ") || "none"}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /uptos/:id/report", () => {
  test("[normal] narrows into an UpToReport carrying the Up-To, with only upToId stored", async () => {
    const reply = await post("/uptos/upt_boba/report", { reason: "SPAM", details: "Same post five times." });
    assert.equal(reply.status, 201);
    const report = reply.body.data;
    assert.deepEqual(Object.keys(report).sort(), [...BASE_KEYS, "upTo"].sort());
    assert.equal(report.targetType, "UPTO");
    assert.equal(report.upTo.id, "upt_boba");
    assert.deepEqual(report.reporter, PEOPLE[0]);
    assert.deepEqual([report.reason, report.details, report.createdAt, report.resolvedAt], ["SPAM", "Same post five times.", NOW, null]);
    assert.deepEqual(
      [db.tables.report[0]!.targetType, db.tables.report[0]!.upToId, db.tables.report[0]!.dropId, db.tables.report[0]!.messageId],
      ["UPTO", "upt_boba", null, null],
    );
    assertOneTarget();
  });

  test("[edge] details are optional, and blank details are stored as none", async () => {
    assert.equal((await post("/uptos/upt_boba/report", { reason: "OTHER" })).body.data.details, null);
    assert.equal((await post("/uptos/upt_boba/report", { reason: "OTHER", details: "   " })).body.data.details, null);
  });

  test("[invalid] a draft the reporter cannot see is 404; a bad reason, long details and signed out are rejected", async () => {
    assert.equal((await post("/uptos/upt_draft/report", { reason: "SPAM" })).status, 404);
    assert.equal((await post("/uptos/upt_nope/report", { reason: "SPAM" })).status, 404);
    assert.equal((await post("/uptos/upt_boba/report", { reason: "spam" })).status, 400);
    assert.equal(
      (await post("/uptos/upt_boba/report", { reason: "SPAM", details: "x".repeat(501) })).body.error.message,
      "details must be at most 500 characters",
    );
    assert.equal((await post("/uptos/upt_boba/report", { reason: "SPAM", upToId: "upt_draft" })).body.error.message, "unexpected field: upToId");
    assert.equal((await post("/uptos/upt_boba/report", { reason: "SPAM" }, null)).status, 401);
    assert.equal(db.tables.report.length, 0);
  });
});

describe("POST /drops/:id/report", () => {
  test("[normal] narrows into a DropReport carrying the drop, with only dropId stored", async () => {
    const reply = await post("/drops/drp_live/report", { reason: "ABOUT_A_PERSON", details: "Names someone." });
    assert.equal(reply.status, 201);
    const report = reply.body.data;
    assert.deepEqual(Object.keys(report).sort(), [...BASE_KEYS, "drop"].sort());
    assert.equal(report.targetType, "DROP");
    assert.equal(report.drop.id, "drp_live");
    assert.deepEqual(
      [db.tables.report[0]!.targetType, db.tables.report[0]!.dropId, db.tables.report[0]!.upToId, db.tables.report[0]!.messageId],
      ["DROP", "drp_live", null, null],
    );
    assertOneTarget();
  });

  test("[edge] an expired drop can still be reported", async () => {
    const reply = await post("/drops/drp_old/report", { reason: "HATE" });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.data.drop.isActive, false);
  });

  test("[invalid] an unknown drop is 404; a bad reason is 400; signed out is 401", async () => {
    assert.equal((await post("/drops/drp_nope/report", { reason: "SPAM" })).status, 404);
    assert.equal((await post("/drops/drp_live/report", { reason: "RUDE" })).status, 400);
    assert.equal((await post("/drops/drp_live/report", { reason: "SPAM" }, null)).status, 401);
    assert.equal(db.tables.report.length, 0);
  });

  test("[normal] reports on both kinds of target share one table, each row with exactly one target", async () => {
    await post("/uptos/upt_boba/report", { reason: "SPAM" });
    await post("/drops/drp_live/report", { reason: "SPAM" });
    assert.deepEqual(db.tables.report.map((row) => row.targetType).sort(), ["DROP", "UPTO"]);
    assertOneTarget();
  });
});
