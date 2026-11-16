/**
 * /admin/* over HTTP against the real admin router, mounted beside the
 * events, Up-To and drops routers so whole paths are tested: an event
 * approved in the admin queue then appears in the student feed, and a report
 * made through the student routes then appears in the admin list.
 *
 * In production one PrismaClient serves every router. Here the events fake
 * and the content fake are composed into one object with the same shape.
 *
 *   npx tsx --test --test-reporter=spec src/routes/admin.route.test.ts
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, describe, test } from "node:test";
import express from "express";
import type { CampusEvent } from "@upto/contracts";
import { ADMIN, EVENTS, ME, NOW, PEOPLE } from "@upto/fixtures";
import type { AdminDb } from "../controllers/admin.controller.js";
import { DROP_LIFETIME_MS } from "../services/drops/drops.js";
import { eventsDb } from "../services/events/fakeDb.js";
import { contentDb } from "../services/uptos/fakeDb.js";
import { adminRouter } from "./admin.route.js";
import { dropsRouter } from "./drops.route.js";
import { eventsRouter } from "./events.route.js";
import { uptosRouter } from "./uptos.route.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const now = () => new Date(NOW);
eventsDb.clock = now;
contentDb.clock = now;

/** One database, as Prisma is: event tables from the events fake, the rest from the content fake. */
const db: any = {
  get campusEvent() { return eventsDb.campusEvent; },
  get eventSource() { return eventsDb.eventSource; },
  get attendance() { return eventsDb.attendance; },
  get user() { return contentDb.user; },
  get upTo() { return contentDb.upTo; },
  get upToRsvp() { return contentDb.upToRsvp; },
  get poll() { return contentDb.poll; },
  get pollSlot() { return contentDb.pollSlot; },
  get pollResponse() { return contentDb.pollResponse; },
  get drop() { return contentDb.drop; },
  get dropVote() { return contentDb.dropVote; },
  get dropRulesAgreement() { return contentDb.dropRulesAgreement; },
  get report() { return contentDb.report; },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
};

const currentUserId = (request: express.Request) => request.header("x-user-id") ?? null;
const app = express();
app.use(express.json());
app.use(adminRouter({ db: db as AdminDb, now, currentUserId }));
app.use(eventsRouter({ db, now, currentUserId }));
app.use(uptosRouter({ db, now, currentUserId }));
app.use(dropsRouter({ db, now, currentUserId }));

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

const date = (iso: string | null) => (iso === null ? null : new Date(iso));

/** Writes one fixture event into the events fake as the columns Prisma would store. */
function insertEvent(event: CampusEvent): void {
  if (event.source && !eventsDb.tables.eventSource.some((s) => s.id === event.source!.id)) {
    eventsDb.insert("eventSource", { id: event.source.id, type: event.source.type, url: "https://example.com/feed", label: event.source.label });
  }
  eventsDb.insert("campusEvent", {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: new Date(event.startsAt),
    endsAt: date(event.endsAt),
    location: event.location,
    lat: event.lat,
    lng: event.lng,
    organizer: event.organizer,
    category: event.category,
    goingCount: event.goingCount,
    reviewStatus: event.reviewStatus,
    signupUrl: event.signup.url,
    signupOpensAt: date(event.signup.opensAt),
    signupClosesAt: date(event.signup.closesAt),
    sourceId: event.source?.id ?? null,
  });
}

const LIZ = PEOPLE[1]!;

beforeEach(() => {
  eventsDb.reset();
  contentDb.reset();
  for (const person of PEOPLE) contentDb.insert("user", { ...person, isAdmin: person.id === ADMIN.id });
  for (const event of EVENTS) insertEvent(event);
});

interface ReplyOf {
  status: number;
  body: any;
}

async function get(path: string, as: string | null = ADMIN.id): Promise<ReplyOf> {
  const response = await fetch(`${baseUrl}${path}`, { headers: as ? { "x-user-id": as } : {} });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function post(path: string, body: unknown = {}, as: string | null = ADMIN.id): Promise<ReplyOf> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (as) headers["x-user-id"] = as;
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const feedIds = async (as: string = ME.id) =>
  (await get("/events", as)).body.data.events.map((event: CampusEvent) => event.id) as string[];

const ADMIN_ROUTES: Array<[string, string]> = [
  ["GET", "/admin/events/pending"],
  ["POST", "/admin/events/evt_pending_1/approve"],
  ["POST", "/admin/events/evt_pending_1/reject"],
  ["GET", "/admin/reports"],
];

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

describe("admin access", () => {
  test("[invalid] signed out is 401 on every admin route", async () => {
    for (const [method, path] of ADMIN_ROUTES) {
      const reply = method === "GET" ? await get(path, null) : await post(path, {}, null);
      assert.equal(reply.status, 401, `${method} ${path}`);
      assert.equal(reply.body.error.code, "unauthorized");
    }
  });

  test("[invalid] a signed-in student who is not an admin is 403 on every admin route, and changes nothing", async () => {
    for (const [method, path] of ADMIN_ROUTES) {
      const reply = method === "GET" ? await get(path, ME.id) : await post(path, {}, ME.id);
      assert.equal(reply.status, 403, `${method} ${path}`);
      assert.deepEqual(reply.body.error, { code: "forbidden", message: "Admins only." });
    }
    assert.equal(eventsDb.tables.campusEvent.find((e) => e.id === "evt_pending_1")!.reviewStatus, "PENDING");
  });

  test("[normal] POST /admin/flyer is not handled by the admin router, so app.ts keeps its 501 stub", async () => {
    const reply = await post("/admin/flyer", {}, ADMIN.id);
    assert.equal(reply.status, 404); // no stub loop in this test app; in app.ts the 501 stub answers
  });
});

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

describe("GET /admin/events/pending", () => {
  test("[normal] lists only PENDING events, soonest first, with the total", async () => {
    insertEvent({ ...EVENTS.find((e) => e.id === "evt_pump")!, id: "evt_imported", reviewStatus: "PENDING", source: null });
    const reply = await get("/admin/events/pending");
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data.events.map((e: CampusEvent) => e.id), ["evt_imported", "evt_pending_1"]);
    assert.equal(reply.body.data.total, 2);
    assert.ok(reply.body.data.events.every((e: CampusEvent) => e.reviewStatus === "PENDING"));
    assert.deepEqual(reply.body.data.events[1], EVENTS.find((e) => e.id === "evt_pending_1"));
  });
});

describe("POST /admin/events/:id/approve and /reject", () => {
  test("[normal] approving moves an event out of the queue and into the student feed", async () => {
    assert.ok(!(await feedIds()).includes("evt_pending_1"));
    const reply = await post("/admin/events/evt_pending_1/approve");
    assert.equal(reply.status, 200);
    assert.equal(reply.body.data.reviewStatus, "APPROVED");
    assert.equal((await get("/admin/events/pending")).body.data.total, 0);
    assert.ok((await feedIds()).includes("evt_pending_1"));
  });

  test("[normal] rejecting keeps it out of the feed; rejecting an approved event takes it down", async () => {
    assert.equal((await post("/admin/events/evt_pending_1/reject")).body.data.reviewStatus, "REJECTED");
    assert.ok(!(await feedIds()).includes("evt_pending_1"));
    assert.ok((await feedIds()).includes("evt_bigsur"));
    await post("/admin/events/evt_bigsur/reject");
    assert.ok(!(await feedIds()).includes("evt_bigsur"));
  });

  test("[edge] approving twice is idempotent; approving a rejected event puts it back", async () => {
    await post("/admin/events/evt_pending_1/approve");
    assert.equal((await post("/admin/events/evt_pending_1/approve")).status, 200);
    await post("/admin/events/evt_pending_1/reject");
    assert.equal((await post("/admin/events/evt_pending_1/approve")).body.data.reviewStatus, "APPROVED");
  });

  test("[invalid] an unknown event is 404", async () => {
    assert.deepEqual((await post("/admin/events/evt_nope/approve")).body.error, { code: "not_found", message: "Event not found" });
    assert.equal((await post("/admin/events/evt_nope/reject")).status, 404);
  });
});

// ---------------------------------------------------------------------------
// Reports queue
// ---------------------------------------------------------------------------

describe("GET /admin/reports", () => {
  test("[normal] both kinds, newest first, each narrowed with the reported target", async () => {
    contentDb.insert("upTo", {
      id: "upt_boba", creatorId: LIZ.id, title: "Boba run", scheduledAt: new Date("2026-11-16T02:00:00.000Z"),
      location: "Benson", shareSlug: "k3f9qz", published: true,
    });
    contentDb.insert("drop", {
      id: "drp_live", authorId: LIZ.id, category: "FREE_FOOD", text: "Pizza in Benson", lat: 37.3487, lng: -121.9385,
      expiresAt: new Date(Date.parse(NOW) + DROP_LIFETIME_MS),
    });
    assert.equal((await post("/uptos/upt_boba/report", { reason: "SPAM" }, ME.id)).status, 201);
    // A later report, so the order is visible.
    contentDb.clock = () => new Date(Date.parse(NOW) + 60_000);
    assert.equal((await post("/drops/drp_live/report", { reason: "HATE", details: "Slur in the text." }, ME.id)).status, 201);
    contentDb.clock = now;

    const reply = await get("/admin/reports");
    assert.equal(reply.status, 200);
    const [first, second] = reply.body.data;
    assert.equal(reply.body.data.length, 2);
    assert.deepEqual([first.targetType, first.drop.id, first.reason, first.details], ["DROP", "drp_live", "HATE", "Slur in the text."]);
    assert.deepEqual([second.targetType, second.upTo.id, second.reason], ["UPTO", "upt_boba", "SPAM"]);
    assert.deepEqual(first.reporter, PEOPLE[0]);
    assert.ok(!("upTo" in first) && !("drop" in second));
  });

  test("[edge] MESSAGE reports share the table but are not listed here; an empty queue is []", async () => {
    assert.deepEqual((await get("/admin/reports")).body.data, []);
    contentDb.insert("report", { reporterId: ME.id, targetType: "MESSAGE", reason: "SPAM", messageId: "msg_3" });
    assert.deepEqual((await get("/admin/reports")).body.data, []);
  });
});
