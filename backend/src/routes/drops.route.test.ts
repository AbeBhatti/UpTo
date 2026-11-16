/**
 * /drops/* over HTTP against the real router, backed by the in-memory
 * ContentFakeDb, with the clock pinned to fixtures/events.ts's NOW.
 *
 * The fake is loaded with both fixture drops as raw rows, with real vote rows
 * behind their hereCount and goneCount, and GET /drops must return the live
 * one exactly as the fixture shows it.
 *
 *   npx tsx --test --test-reporter=spec src/routes/drops.route.test.ts
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, describe, test } from "node:test";
import express from "express";
import type { Drop } from "@upto/contracts";
import { DROPS, ME, NOW, PEOPLE } from "@upto/fixtures";
import type { DropsDb } from "../services/drops/db.js";
import { DROP_LIFETIME_MS } from "../services/drops/drops.js";
import { contentDb as db } from "../services/uptos/fakeDb.js";
import { dropsRouter } from "./drops.route.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** The pinned clock. Tests may move it; beforeEach puts it back on NOW. */
let clockAt = NOW;
const now = () => new Date(clockAt);
db.clock = now;

const app = express();
app.use(express.json());
app.use(
  dropsRouter({
    db: db as unknown as DropsDb,
    now,
    currentUserId: (request) => request.header("x-user-id") ?? null,
  }),
);

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
const VOTERS = Array.from({ length: 10 }, (_, i) => `usr_voter${i}`);

/** Writes one fixture drop as stored columns, with vote rows behind its counts. */
function insertFixture(drop: Drop): void {
  db.insert("drop", {
    id: drop.id,
    authorId: drop.author.id,
    category: drop.category,
    text: drop.text,
    lat: drop.lat,
    lng: drop.lng,
    expiresAt: new Date(drop.expiresAt),
    createdAt: new Date(Date.parse(drop.expiresAt) - DROP_LIFETIME_MS),
  });
  const votes: Array<[string, "HERE" | "GONE"]> = [];
  if (drop.myVote) votes.push([ME.id, drop.myVote]);
  const others = VOTERS.slice();
  for (const kind of ["HERE", "GONE"] as const) {
    const total = kind === "HERE" ? drop.hereCount : drop.goneCount;
    const have = votes.filter(([, k]) => k === kind).length;
    for (let i = have; i < total; i++) votes.push([others.shift()!, kind]);
  }
  for (const [userId, kind] of votes) db.insert("dropVote", { dropId: drop.id, userId, kind });
}

beforeEach(() => {
  clockAt = NOW;
  db.reset();
  for (const person of PEOPLE) db.insert("user", { ...person });
  for (const id of VOTERS) db.insert("user", { id, username: id, name: id });
  for (const drop of DROPS) insertFixture(drop);
});

interface ReplyOf {
  status: number;
  body: any;
}

async function get(path: string, as: string | null = ME.id): Promise<ReplyOf> {
  const response = await fetch(`${baseUrl}${path}`, { headers: as ? { "x-user-id": as } : {} });
  return { status: response.status, body: await response.json() };
}

async function post(path: string, body: unknown, as: string | null = ME.id): Promise<ReplyOf> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (as) headers["x-user-id"] = as;
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const pizza = { category: "FREE_FOOD", text: "  Free   bagels at   the Learning Commons ", lat: 37.3499, lng: -121.9368 };
const agree = (as: string = ME.id) => post("/drops/rules-agreement", { rulesVersion: 2 }, as);

// ---------------------------------------------------------------------------
// GET /drops
// ---------------------------------------------------------------------------

describe("GET /drops", () => {
  test("[normal] only active drops, exactly as fixtures/events.ts shows them", async () => {
    const reply = await get("/drops");
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data, [DROPS[0]]);
  });

  test("[edge] Drop.isActive is expiresAt > now: at its exact expiry instant a drop is gone", async () => {
    clockAt = DROPS[0]!.expiresAt;
    assert.deepEqual((await get("/drops")).body.data, []);
  });

  test("[normal] signed out, the list still loads and myVote is null", async () => {
    const reply = await get("/drops", null);
    assert.equal(reply.body.data[0].myVote, null);
    assert.equal(reply.body.data[0].hereCount, 7);
  });
});

// ---------------------------------------------------------------------------
// POST /drops/rules-agreement and POST /drops
// ---------------------------------------------------------------------------

describe("POST /drops", () => {
  test("[normal] posts a drop that expires after DROP_LIFETIME_MS, with the validator's normalised text", async () => {
    await agree();
    const reply = await post("/drops", pizza);
    assert.equal(reply.status, 201);
    const drop = reply.body.data;
    assert.equal(drop.text, "Free bagels at the Learning Commons");
    assert.equal(drop.expiresAt, new Date(Date.parse(NOW) + DROP_LIFETIME_MS).toISOString());
    assert.deepEqual([drop.isActive, drop.hereCount, drop.goneCount, drop.myVote], [true, 0, 0, null]);
    assert.deepEqual(drop.author, PEOPLE[0]);
    assert.ok((await get("/drops")).body.data.some((d: Drop) => d.id === drop.id));
  });

  test("[edge] clientRef makes it idempotent: a replay returns the same drop with 200, not a second pin", async () => {
    await agree();
    const first = await post("/drops", { ...pizza, clientRef: "retry-0001" });
    const again = await post("/drops", { ...pizza, text: "a different text", clientRef: "retry-0001" });
    assert.equal(first.status, 201);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data, first.body.data);
    // The same clientRef from another person is their own drop.
    await agree(LIZ.id);
    assert.equal((await post("/drops", { ...pizza, clientRef: "retry-0001" }, LIZ.id)).status, 201);
    assert.equal(db.tables.drop.length, DROPS.length + 2);
  });

  test("[invalid] no agreement, or an agreement to an older rules version, is 409 rules_outdated", async () => {
    const none = await post("/drops", pizza);
    assert.equal(none.status, 409);
    assert.equal(none.body.error.code, "rules_outdated");
    await post("/drops/rules-agreement", { rulesVersion: 1 });
    assert.equal((await post("/drops", pizza)).body.error.code, "rules_outdated");
    assert.equal((await agree()).status, 200);
    assert.equal((await post("/drops", pizza)).status, 201);
  });

  test("[invalid] the validator's limits and .strict() apply; signed out is 401", async () => {
    await agree();
    assert.equal((await post("/drops", { ...pizza, text: "ab" })).body.error.message, "text must be 3 to 80 characters");
    assert.equal((await post("/drops", { ...pizza, expiresAt: "2030-01-01T00:00:00Z" })).body.error.message, "unexpected field: expiresAt");
    assert.equal((await post("/drops", { ...pizza, authorId: LIZ.id })).body.error.message, "unexpected field: authorId");
    assert.equal((await post("/drops/rules-agreement", { rulesVersion: 3 })).body.error.message, "rulesVersion must be 1 to 2");
    assert.equal((await post("/drops", pizza, null)).status, 401);
    assert.equal(db.tables.drop.length, DROPS.length);
  });
});

// ---------------------------------------------------------------------------
// POST /drops/:id/vote
// ---------------------------------------------------------------------------

describe("POST /drops/:id/vote", () => {
  const live = DROPS[0]!;

  test("[normal] HERE and GONE count, and myVote is the caller's", async () => {
    const here = await post(`/drops/${live.id}/vote`, { vote: "HERE" });
    assert.deepEqual([here.body.data.hereCount, here.body.data.goneCount, here.body.data.myVote], [8, 1, "HERE"]);
    const gone = await post(`/drops/${live.id}/vote`, { vote: "GONE" });
    assert.deepEqual([gone.body.data.hereCount, gone.body.data.goneCount, gone.body.data.myVote], [7, 2, "GONE"]);
  });

  test("[normal] null withdraws the vote by deleting the row", async () => {
    await post(`/drops/${live.id}/vote`, { vote: "HERE" });
    const before = db.tables.dropVote.length;
    const withdrawn = await post(`/drops/${live.id}/vote`, { vote: null });
    assert.deepEqual([withdrawn.body.data.hereCount, withdrawn.body.data.myVote], [7, null]);
    assert.equal(db.tables.dropVote.length, before - 1);
    // Withdrawing with no vote is a no-op, not an error.
    assert.equal((await post(`/drops/${live.id}/vote`, { vote: null })).status, 200);
  });

  test("[invalid] an expired drop is 410; an unknown one 404; a bad vote 400; signed out 401", async () => {
    const expired = await post(`/drops/${DROPS[1]!.id}/vote`, { vote: "HERE" });
    assert.deepEqual(expired.body.error, { code: "expired", message: "This drop has expired." });
    assert.equal((await post("/drops/drp_nope/vote", { vote: "HERE" })).status, 404);
    assert.equal((await post(`/drops/${live.id}/vote`, { vote: "MAYBE" })).body.error.message, "vote must be HERE, GONE or null");
    assert.equal((await post(`/drops/${live.id}/vote`, { vote: "HERE" }, null)).status, 401);
  });
});
