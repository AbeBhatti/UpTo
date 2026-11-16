/**
 * /uptos/* and /u/:slug over HTTP against the real router, backed by the
 * in-memory ContentFakeDb, with the clock pinned to fixtures/events.ts's NOW.
 *
 * Includes the swap check for Liz: POST /uptos and her fixture-mode mock
 * (web/app/(app)/create/_shared/mock.ts) are given the same body and must
 * return the same UpTo shape, so flipping NEXT_PUBLIC_USE_FIXTURES=false is
 * checked rather than hoped for.
 *
 *   npx tsx --test --test-reporter=spec src/routes/uptos.route.test.ts
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, test } from "node:test";
import express from "express";
import type { ApiResponse, CreateUpToRequest, UpTo } from "@upto/contracts";
import { ME, NOW, PEOPLE, UPTOS } from "@upto/fixtures";
import type { UpTosDb } from "../services/uptos/db.js";
import { contentDb as db } from "../services/uptos/fakeDb.js";
import { SLUG_ALPHABET } from "../services/uptos/slug.js";
import { uptosRouter } from "./uptos.route.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const now = () => new Date(NOW);
db.clock = now;

let slugs: string[] = [];
const app = express();
app.use(express.json());
app.use(
  uptosRouter({
    db: db as unknown as UpTosDb,
    now,
    // Tests can queue slugs to force a clash; otherwise the real generator runs.
    newSlug: () => slugs.shift() ?? randomSlug(),
    currentUserId: (request) => request.header("x-user-id") ?? null,
  }),
);

function randomSlug(): string {
  return Array.from({ length: 6 }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join("");
}

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
const ABE = PEOPLE[2]!;

beforeEach(() => {
  slugs = [];
  db.reset();
  for (const person of PEOPLE) {
    db.insert("user", { ...person, email: person.id === ME.id ? ME.email : null, phone: null, isVerifiedStudent: person.id === ME.id });
  }
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

/** The fixture's CSEN 174 study session, as a create request. */
const studySession: CreateUpToRequest = {
  title: UPTOS[0]!.title,
  description: UPTOS[0]!.description,
  scheduledAt: UPTOS[0]!.scheduledAt,
  location: UPTOS[0]!.location,
  lat: UPTOS[0]!.lat!,
  lng: UPTOS[0]!.lng!,
  publish: true,
};

const UPTO_KEYS = [
  "id", "creator", "title", "description", "scheduledAt", "location", "lat", "lng",
  "shareSlug", "shareUrl", "published", "goingCount", "myRsvp", "poll", "timeLabel",
].sort();
const PUBLIC_USER_KEYS = ["id", "username", "name", "avatarSeed", "avatarUrl"].sort();
const SLUG = new RegExp(`^[${SLUG_ALPHABET}]{6}$`);

async function create(body: unknown = studySession, as: string = LIZ.id): Promise<UpTo> {
  const reply = await post("/uptos", body, as);
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  return reply.body.data;
}

// ---------------------------------------------------------------------------
// POST /uptos
// ---------------------------------------------------------------------------

describe("POST /uptos", () => {
  test("[normal] publish: true creates a published Up-To with a share link, and nobody going yet", async () => {
    const upTo = await create();
    assert.deepEqual(Object.keys(upTo).sort(), UPTO_KEYS);
    assert.match(upTo.shareSlug, SLUG);
    assert.equal(upTo.shareUrl, `https://up-to.co/u/${upTo.shareSlug}`);
    assert.deepEqual(upTo.creator, LIZ);
    assert.equal(upTo.published, true);
    assert.equal(upTo.goingCount, 0);
    assert.equal(upTo.myRsvp, null);
    assert.equal(upTo.poll, null);
    assert.equal(db.tables.upTo[0]!.publishedAt.toISOString(), NOW);
  });

  test("[normal] timeLabel comes from the events code: the fixture's study session reads as the fixture does", async () => {
    const upTo = await create();
    assert.equal(upTo.timeLabel, UPTOS[0]!.timeLabel); // "Tomorrow 6:00 p.m."
    assert.equal(upTo.scheduledAt, UPTOS[0]!.scheduledAt);
  });

  test("[normal] the response has the exact shape Liz's fixture-mode mock returns for the same body", async () => {
    const mockPath = fileURLToPath(new URL("../../../web/app/(app)/create/_shared/mock.ts", import.meta.url));
    const { mockCall } = (await import(mockPath)) as {
      mockCall: <T>(key: "createUpTo", path: string, body: unknown) => Promise<ApiResponse<T>>;
    };
    const body = { ...studySession, description: "  Bring\r\n\r\n\r\nyour laptop.  " };
    const fromMock = await mockCall<UpTo>("createUpTo", "/uptos", body);
    assert.equal(fromMock.ok, true);
    const mock = (fromMock as { data: UpTo }).data;
    const real = await create(body);

    // Same fields, same nesting, same nulls.
    assert.deepEqual(Object.keys(real).sort(), Object.keys(mock).sort());
    for (const key of UPTO_KEYS as Array<keyof UpTo>) {
      const kind = (value: unknown) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
      assert.equal(kind(real[key]), kind(mock[key]), `type of ${key}`);
    }
    // Same values wherever the mock is not inventing ids, slugs or the time label.
    for (const key of ["title", "description", "location", "lat", "lng", "published", "goingCount", "myRsvp", "poll", "creator"] as const) {
      assert.deepEqual(real[key], mock[key], key);
    }
    assert.equal(Date.parse(real.scheduledAt), Date.parse(mock.scheduledAt));
    // The same slug format and share-link form.
    assert.match(mock.shareSlug, SLUG);
    assert.match(real.shareSlug, SLUG);
    assert.equal(mock.shareUrl, `https://up-to.co/u/${mock.shareSlug}`);
    assert.equal(real.shareUrl, `https://up-to.co/u/${real.shareSlug}`);
  });

  test("[normal] without publish it is a draft: the creator sees it, nobody else can, and it has no share page", async () => {
    const draft = await create({ ...studySession, publish: undefined });
    assert.equal(draft.published, false);
    assert.equal(db.tables.upTo[0]!.publishedAt, null);
    assert.equal((await get(`/uptos/${draft.id}`, LIZ.id)).status, 200);
    assert.equal((await get(`/uptos/${draft.id}`, ME.id)).status, 404);
    assert.equal((await get(`/uptos/${draft.id}`, null)).status, 404);
    assert.equal((await get(`/u/${draft.shareSlug}`, LIZ.id)).status, 404);
  });

  test("[normal] contact is stored but not returned: the contract has no contact field yet", async () => {
    const upTo = await create({ ...studySession, contact: " liz@scu.edu " });
    assert.equal(db.tables.upTo[0]!.contact, "liz@scu.edu");
    assert.ok(!("contact" in upTo));
  });

  test("[edge] a share-slug clash is retried with a fresh slug; five clashes in a row are a 500", async () => {
    const first = await create();
    slugs = [first.shareSlug, first.shareSlug, "fresh2"];
    const second = await create();
    assert.equal(second.shareSlug, "fresh2");

    slugs = Array(5).fill(first.shareSlug);
    const reply = await post("/uptos", studySession, LIZ.id);
    assert.equal(reply.status, 500);
    assert.equal(reply.body.error.code, "server_error");
    assert.equal(db.tables.upTo.length, 2);
  });

  test("[invalid] signed out is 401; a server-owned field, a bad time and a missing title are 400 with the field", async () => {
    assert.equal((await post("/uptos", studySession, null)).status, 401);

    const owned = await post("/uptos", { ...studySession, creatorId: ME.id }, LIZ.id);
    assert.equal(owned.status, 400);
    assert.equal(owned.body.error.message, "unexpected field: creatorId");

    const time = await post("/uptos", { ...studySession, scheduledAt: "next friday" }, LIZ.id);
    assert.deepEqual(time.body.error, { code: "invalid_request", message: "scheduledAt must be an ISO date-time", field: "scheduledAt" });

    const { title: _, ...untitled } = studySession;
    const title = await post("/uptos", untitled, LIZ.id);
    assert.equal(title.body.error.field, "title");
    assert.equal(db.tables.upTo.length, 0);
  });
});

// ---------------------------------------------------------------------------
// GET /uptos/:id and the public share page
// ---------------------------------------------------------------------------

describe("GET /uptos/:id", () => {
  test("[normal] a published Up-To is readable by anyone, signed out included", async () => {
    const upTo = await create();
    const signedOut = await get(`/uptos/${upTo.id}`, null);
    assert.equal(signedOut.status, 200);
    assert.deepEqual(signedOut.body.data, upTo);
  });

  test("[invalid] an unknown id is 404", async () => {
    const reply = await get("/uptos/upt_nope");
    assert.deepEqual(reply.body, { ok: false, error: { code: "not_found", message: "Up-To not found" } });
  });
});

describe("GET /u/:slug — the public share page", () => {
  test("[normal] works with no session, and shows a signed-out visitor no personal state", async () => {
    const upTo = await create();
    await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING", anonymous: true }, ABE.id);
    const page = await get(`/u/${upTo.shareSlug}`, null);
    assert.equal(page.status, 200);
    assert.equal(page.body.data.id, upTo.id);
    assert.equal(page.body.data.myRsvp, null);
    assert.equal(page.body.data.goingCount, 1);
  });

  test("[normal] leaks nothing beyond the contract: no contact, no creator email, no attendee ids", async () => {
    const upTo = await create({ ...studySession, contact: "liz@scu.edu" });
    await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING", anonymous: true }, ME.id);
    const page = (await get(`/u/${upTo.shareSlug}`, null)).body.data;
    assert.deepEqual(Object.keys(page).sort(), UPTO_KEYS);
    assert.deepEqual(Object.keys(page.creator).sort(), PUBLIC_USER_KEYS);
    const raw = JSON.stringify(page);
    for (const secret of ["liz@scu.edu", ME.id, ME.email!, ME.username]) assert.ok(!raw.includes(secret), secret);
  });

  test("[invalid] an unknown slug, and a draft's slug, are 404", async () => {
    assert.equal((await get("/u/zzzzzz", null)).status, 404);
    const draft = await create({ ...studySession, publish: false });
    assert.equal((await get(`/u/${draft.shareSlug}`, null)).status, 404);
  });
});

// ---------------------------------------------------------------------------
// POST /uptos/:id/rsvp
// ---------------------------------------------------------------------------

describe("POST /uptos/:id/rsvp", () => {
  test("[normal] GOING counts the viewer and returns the Up-To as they now see it", async () => {
    const upTo = await create();
    const reply = await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING" });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.data.goingCount, 1);
    assert.deepEqual(reply.body.data.myRsvp, { going: true, anonymous: false });
  });

  test("[normal] an anonymous RSVP counts toward goingCount but is visible only to its own user", async () => {
    const upTo = await create();
    const mine = await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING", anonymous: true }, ME.id);
    assert.deepEqual(mine.body.data.myRsvp, { going: true, anonymous: true });

    const others = await get(`/uptos/${upTo.id}`, ABE.id);
    assert.equal(others.body.data.goingCount, 1);
    assert.equal(others.body.data.myRsvp, null);
    assert.ok(!JSON.stringify(others.body.data).includes(ME.id));
  });

  test("[edge] repeating an RSVP updates the anonymity and never double counts", async () => {
    const upTo = await create();
    await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING" });
    const again = await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING", anonymous: true });
    assert.equal(again.body.data.goingCount, 1);
    assert.deepEqual(again.body.data.myRsvp, { going: true, anonymous: true });
    assert.equal(db.tables.upToRsvp.length, 1);
  });

  test("[invalid] MAYBE and a string 'true' are 400; signed out is 401; someone else's draft is 404", async () => {
    const upTo = await create();
    assert.equal((await post(`/uptos/${upTo.id}/rsvp`, { status: "MAYBE" })).body.error.message, "status must be GOING");
    assert.equal((await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING", anonymous: "true" })).status, 400);
    assert.equal((await post(`/uptos/${upTo.id}/rsvp`, { status: "GOING" }, null)).status, 401);
    const draft = await create({ ...studySession, publish: false });
    assert.equal((await post(`/uptos/${draft.id}/rsvp`, { status: "GOING" }, ME.id)).status, 404);
    assert.equal(db.tables.upToRsvp.length, 0);
  });
});
