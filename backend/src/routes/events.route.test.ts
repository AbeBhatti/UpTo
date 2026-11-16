/**
 * /events over HTTP against the real router, backed by the in-memory
 * EventsFakeDb, with the clock pinned to fixtures/events.ts's NOW.
 *
 * The fake is loaded with each fixture event's raw columns. Home's three
 * sections are then fetched as the fixture's viewer and must deep-equal the
 * fixtures, in fixture order: the whole CampusEvent shape, not only the
 * computed fields.
 *
 *   npx tsx --test --test-reporter=spec src/routes/events.route.test.ts
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, describe, test } from "node:test";
import express from "express";
import type { CampusEvent } from "@upto/contracts";
import { ADMIN, EVENTS, ME, NOW } from "@upto/fixtures";
import type { EventsDb } from "../services/events/db.js";
import { eventsDb as db } from "../services/events/fakeDb.js";
import { eventsRouter } from "./events.route.js";

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
  eventsRouter({
    db: db as unknown as EventsDb,
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

const date = (iso: string | null) => (iso === null ? null : new Date(iso));

/** Writes one fixture event into the fake as the columns Prisma would store. */
function insertFixture(event: CampusEvent): void {
  if (event.source && !db.tables.eventSource.some((s) => s.id === event.source!.id)) {
    db.insert("eventSource", { id: event.source.id, type: event.source.type, url: "https://example.com/feed", label: event.source.label });
  }
  db.insert("campusEvent", {
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
  if (event.myStatus) db.insert("attendance", { userId: ME.id, campusEventId: event.id, status: event.myStatus });
}

beforeEach(() => {
  clockAt = NOW;
  db.reset();
  db.insert("user", { id: ME.id, username: ME.username, name: ME.name, isVerifiedStudent: true });
  db.insert("user", { id: ADMIN.id, username: ADMIN.username, name: ADMIN.name, isAdmin: true });
  db.insert("user", { id: "usr_liz", username: "liz", name: "Liz M." });
  for (const event of EVENTS) insertFixture(event);
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

const fixtures = (...ids: string[]) => ids.map((id) => EVENTS.find((event) => event.id === id)!);
const ids = (reply: ReplyOf) => reply.body.data.events.map((event: CampusEvent) => event.id);
const going = (eventId: string) => db.tables.campusEvent.find((event) => event.id === eventId)!.goingCount;

// ---------------------------------------------------------------------------
// GET /events — the contract, section by section
// ---------------------------------------------------------------------------

describe("GET /events matches fixtures/events.ts", () => {
  test("Right Now: the three live events, soonest end first, exactly as the fixtures", async () => {
    const reply = await get("/events?when=now");
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data.events, fixtures("evt_pickleball", "evt_n8n", "evt_field_hockey"));
  });

  test("Later today: the two events starting later today, exactly as the fixtures", async () => {
    const reply = await get("/events?when=today");
    assert.deepEqual(reply.body.data.events, fixtures("evt_pump", "evt_mass"));
  });

  test("This week: the six events from tomorrow to Saturday, exactly as the fixtures", async () => {
    const reply = await get("/events?when=week");
    assert.deepEqual(
      reply.body.data.events,
      fixtures("evt_prague", "evt_resume", "evt_cpt", "evt_stem", "evt_archives", "evt_bigsur"),
    );
  });

  test("no window: live and upcoming together, never the pending event", async () => {
    const reply = await get("/events");
    assert.equal(reply.body.data.events.length, 11);
    assert.ok(!ids(reply).includes("evt_pending_1"));
    assert.equal(reply.body.data.nextCursor, null);
  });

  test("quarter and past are empty for these fixtures; past picks up an event that has ended", async () => {
    assert.deepEqual(ids(await get("/events?when=quarter")), []);
    assert.deepEqual(ids(await get("/events?when=past")), []);
    db.insert("campusEvent", {
      id: "evt_yesterday",
      title: "Yesterday's talk",
      startsAt: new Date("2026-11-14T22:00:00Z"),
      endsAt: new Date("2026-11-14T23:00:00Z"),
      location: "Benson",
      reviewStatus: "APPROVED",
    });
    const past = await get("/events?when=past");
    assert.deepEqual(ids(past), ["evt_yesterday"]);
    assert.equal(past.body.data.events[0].timeLabel, "Nov 14, 2:00 p.m.");
  });

  test("no end time: field hockey is live at NOW, over two hours after it starts, and then in past", async () => {
    // Starts 12:00 p.m. with no endsAt; its label says "Ends around 2:00 p.m.".
    const atNow = await get("/events?when=now");
    assert.ok(ids(atNow).includes("evt_field_hockey"));
    const live = atNow.body.data.events.find((event: CampusEvent) => event.id === "evt_field_hockey");
    assert.equal(live.isLiveNow, true);
    assert.equal(live.timeLabel, "Ends around 2:00 p.m.");
    assert.ok(!ids(await get("/events?when=past")).includes("evt_field_hockey"));

    clockAt = "2026-11-15T22:00:00.000Z"; // 2:00 p.m., the end its label named
    assert.ok(!ids(await get("/events?when=now")).includes("evt_field_hockey"));
    assert.equal((await get("/events/evt_field_hockey")).body.data.isLiveNow, false);
    assert.ok(ids(await get("/events?when=past")).includes("evt_field_hockey"));
    assert.ok(!ids(await get("/events")).includes("evt_field_hockey"), "not in live-or-upcoming either");

    clockAt = "2026-11-22T21:00:00.000Z"; // a week later it stays past, never live again
    assert.ok(!ids(await get("/events?when=now")).includes("evt_field_hockey"));
    assert.ok(ids(await get("/events?when=past")).includes("evt_field_hockey"));
  });
});

describe("GET /events — review status, viewers, filters and paging", () => {
  test("[normal] the pending event is absent from every window, even for an admin", async () => {
    for (const when of ["now", "today", "week", "quarter", "past"]) {
      assert.ok(!ids(await get(`/events?when=${when}`, ADMIN.id)).includes("evt_pending_1"), when);
    }
  });

  test("[normal] only APPROVED events reach the feed: REJECTED is absent too, and neither is counted", async () => {
    const before = (await get("/events", ADMIN.id)).body.data;
    // A live career event, like evt_n8n, that an admin rejected.
    insertFixture({ ...fixtures("evt_n8n")[0], id: "evt_rejected", reviewStatus: "REJECTED" });
    for (const when of ["", "?when=now", "?when=today", "?when=week", "?when=quarter", "?when=past"]) {
      const reply = await get(`/events${when}`, ADMIN.id);
      assert.ok(!ids(reply).includes("evt_rejected"), when || "no window");
    }
    const after = (await get("/events", ADMIN.id)).body.data;
    assert.deepEqual(after.counts, before.counts);
    // The pending potluck is the only food event, so an unapproved event leaking
    // into the counts would show here.
    assert.equal(after.counts.free_food, 0);
    assert.equal((await get("/events/evt_rejected")).status, 404);
  });

  test("[normal] signed out, the feed still loads and myStatus is null everywhere", async () => {
    const reply = await get("/events?when=now", null);
    assert.equal(reply.status, 200);
    assert.deepEqual(
      reply.body.data.events.map((event: CampusEvent) => event.myStatus),
      [null, null, null],
    );
  });

  test("[normal] filter narrows the list; counts ignore the filter so every chip keeps its total", async () => {
    const reply = await get("/events?when=week&filter=career");
    assert.deepEqual(ids(reply), ["evt_resume", "evt_cpt", "evt_stem"]);
    assert.deepEqual(reply.body.data.counts, { all: 6, free_food: 0, clubs: 0, active: 0, career: 3 });
  });

  test("[normal] category narrows both the list and the counts", async () => {
    const reply = await get("/events?category=sports");
    assert.deepEqual(ids(reply), ["evt_field_hockey", "evt_pickleball", "evt_pump"]);
    assert.equal(reply.body.data.counts.all, 3);
    assert.equal(reply.body.data.counts.active, 3);
  });

  test("[edge] paging: limit 4 walks the week in order, and the last page has no cursor", async () => {
    const first = await get("/events?when=week&limit=4");
    assert.deepEqual(ids(first), ["evt_prague", "evt_resume", "evt_cpt", "evt_stem"]);
    assert.equal(first.body.data.nextCursor, "4");
    const second = await get(`/events?when=week&limit=4&cursor=${first.body.data.nextCursor}`);
    assert.deepEqual(ids(second), ["evt_archives", "evt_bigsur"]);
    assert.equal(second.body.data.nextCursor, null);
  });

  test("[invalid] an unknown window, filter or category, a bad limit, and an unknown parameter are 400", async () => {
    const cases: Array<[string, string]> = [
      ["/events?when=tomorrow", "when"],
      ["/events?filter=boba", "filter"],
      ["/events?category=parties", "category"],
      ["/events?limit=0", "limit"],
      ["/events?limit=101", "limit"],
      ["/events?limit=2.5", "limit"],
      ["/events?cursor=-1", "cursor"],
    ];
    for (const [path, field] of cases) {
      const reply = await get(path);
      assert.equal(reply.status, 400, path);
      assert.equal(reply.body.error.code, "invalid_request", path);
      assert.equal(reply.body.error.field, field, path);
    }
    const unknown = await get("/events?userId=usr_liz");
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.message, "unexpected query parameter: userId");
  });
});

// ---------------------------------------------------------------------------
// GET /events/:id
// ---------------------------------------------------------------------------

describe("GET /events/:id", () => {
  test("[normal] an approved event, exactly as the fixture", async () => {
    const reply = await get("/events/evt_field_hockey");
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data, fixtures("evt_field_hockey")[0]);
  });

  test("[invalid] a pending event is 404 to a student and to a signed-out viewer, 200 to an admin", async () => {
    assert.equal((await get("/events/evt_pending_1")).status, 404);
    assert.equal((await get("/events/evt_pending_1", null)).status, 404);
    const admin = await get("/events/evt_pending_1", ADMIN.id);
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.body.data, fixtures("evt_pending_1")[0]);
  });

  test("[invalid] an unknown id is 404", async () => {
    const reply = await get("/events/evt_nope");
    assert.equal(reply.status, 404);
    assert.deepEqual(reply.body, { ok: false, error: { code: "not_found", message: "Event not found" } });
  });
});

// ---------------------------------------------------------------------------
// POST /events/:id/rsvp — Attendance.setStatus, goingCount recomputed
// ---------------------------------------------------------------------------

describe("POST /events/:id/rsvp", () => {
  beforeEach(() => {
    // A clean event with no RSVPs, so every count below is earned.
    db.insert("campusEvent", {
      id: "evt_fresh",
      title: "Fresh event",
      startsAt: new Date("2026-11-16T03:00:00Z"),
      location: "Benson",
      reviewStatus: "APPROVED",
    });
  });

  test("[normal] GOING counts the viewer and returns the event as they now see it", async () => {
    const reply = await post("/events/evt_fresh/rsvp", { status: "GOING" });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.data.myStatus, "GOING");
    assert.equal(reply.body.data.goingCount, 1);
    assert.equal(going("evt_fresh"), 1);
  });

  test("[edge] repeating GOING does not double count; one row per user per event", async () => {
    await post("/events/evt_fresh/rsvp", { status: "GOING" });
    const again = await post("/events/evt_fresh/rsvp", { status: " going " });
    assert.equal(again.body.data.goingCount, 1);
    assert.equal(db.tables.attendance.filter((row) => row.campusEventId === "evt_fresh").length, 1);
  });

  test("[normal] INTERESTED and NOT_GOING are kept as statuses and uncount the viewer", async () => {
    await post("/events/evt_fresh/rsvp", { status: "GOING" });
    await post("/events/evt_fresh/rsvp", { status: "GOING" }, "usr_liz");
    assert.equal(going("evt_fresh"), 2);

    const interested = await post("/events/evt_fresh/rsvp", { status: "INTERESTED" });
    assert.equal(interested.body.data.myStatus, "INTERESTED");
    assert.equal(interested.body.data.goingCount, 1);

    const notGoing = await post("/events/evt_fresh/rsvp", { status: "NOT_GOING" }, "usr_liz");
    assert.equal(notGoing.body.data.goingCount, 0);
    assert.equal(db.tables.attendance.filter((row) => row.campusEventId === "evt_fresh").length, 2);
  });

  test("[normal] goingCount is recomputed from rows, so a stale stored count self-corrects", async () => {
    // evt_pump stores 4 from the fixture but has no attendance rows behind it.
    const reply = await post("/events/evt_pump/rsvp", { status: "GOING" });
    assert.equal(reply.body.data.goingCount, 1);
  });

  test("[invalid] signed out is 401; a pending or unknown event is 404 and writes nothing", async () => {
    const anonymous = await post("/events/evt_fresh/rsvp", { status: "GOING" }, null);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, "unauthorized");
    assert.equal((await post("/events/evt_pending_1/rsvp", { status: "GOING" })).status, 404);
    assert.equal((await post("/events/evt_nope/rsvp", { status: "GOING" })).status, 404);
    assert.equal(db.tables.attendance.length, 1); // only the fixture's field hockey RSVP
  });

  test("[invalid] a bad status, and a body naming another user, are 400", async () => {
    const maybe = await post("/events/evt_fresh/rsvp", { status: "MAYBE" });
    assert.equal(maybe.status, 400);
    assert.equal(maybe.body.error.field, "status");
    const proxy = await post("/events/evt_fresh/rsvp", { status: "GOING", userId: "usr_liz" });
    assert.equal(proxy.status, 400);
    assert.equal(proxy.body.error.message, "unexpected field: userId");
  });
});

// ---------------------------------------------------------------------------
// POST /events/rsvp/sync
// ---------------------------------------------------------------------------

describe("POST /events/rsvp/sync", () => {
  test("[normal] applies each approved id once and skips unknown and pending ids, in order", async () => {
    const reply = await post("/events/rsvp/sync", {
      eventIds: ["evt_pump", "evt_nope", "evt_pump", "evt_pending_1", "evt_mass"],
      status: "GOING",
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data, { updated: 2, skipped: ["evt_nope", "evt_pending_1"] });
    assert.equal(going("evt_pump"), 1);
    assert.equal(going("evt_mass"), 1);
  });

  test("[edge] 200 ids pass the cap even when none exist; 201 are rejected", async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `evt_ghost_${i}`);
    const ok = await post("/events/rsvp/sync", { eventIds: many(200), status: "GOING" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.updated, 0);
    assert.equal(ok.body.data.skipped.length, 200);
    const tooMany = await post("/events/rsvp/sync", { eventIds: many(201), status: "GOING" });
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.error.message, "eventIds must have 1 to 200 ids");
  });

  test("[edge/invalid] a 191-character id is skipped, a 192-character id is a 400", async () => {
    const fits = await post("/events/rsvp/sync", { eventIds: ["x".repeat(191)], status: "GOING" });
    assert.deepEqual(fits.body.data, { updated: 0, skipped: ["x".repeat(191)] });
    const tooLong = await post("/events/rsvp/sync", { eventIds: ["x".repeat(192)], status: "GOING" });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.error.message, "event ids must be at most 191 characters");
  });

  test("[invalid] signed out is 401", async () => {
    const reply = await post("/events/rsvp/sync", { eventIds: ["evt_pump"], status: "GOING" }, null);
    assert.equal(reply.status, 401);
  });
});
