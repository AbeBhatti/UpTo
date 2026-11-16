/**
 * The LiveWhale importer against a REAL captured response from
 * events.scu.edu (fixtures/livewhale-2026-11-16.json, 20 events, email
 * addresses redacted), so the build never depends on the live calendar.
 *
 *   npx tsx --test --test-reporter=spec src/services/importer/importer.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, test } from "node:test";
import { EVENTS } from "@upto/fixtures";
import { eventsDb as db } from "../events/fakeDb.js";
import { importLiveWhale, type ImporterDb } from "./importer.js";
import { LIVEWHALE_FEED_URL, decodeEntities, htmlToText, parseLiveWhale, type LiveWhaleResponse } from "./livewhale.js";

const captured: LiveWhaleResponse = JSON.parse(
  readFileSync(new URL("./fixtures/livewhale-2026-11-16.json", import.meta.url), "utf8"),
);
const copy = (): LiveWhaleResponse => structuredClone(captured);
const NOW = new Date("2026-11-16T17:00:00.000Z");
const byId = (id: number) => parseLiveWhale(captured).events.find((event) => event.externalId === String(id))!;

describe("parseLiveWhale on a captured events.scu.edu response", () => {
  test("[normal] every event in the capture parses, none skipped", () => {
    const { events, skipped } = parseLiveWhale(captured);
    assert.equal(captured.data.length, 20);
    assert.equal(events.length, 20);
    assert.deepEqual(skipped, []);
    assert.equal(new Set(events.map((event) => event.externalId)).size, 20);
  });

  test("[normal] UTC times without a zone marker are read as UTC, matching the events Home was built from", () => {
    // Two events Edrick's fixtures were taken from appear in the real feed.
    assert.equal(byId(521824).startsAt.toISOString(), EVENTS.find((e) => e.id === "evt_prague")!.startsAt);
    assert.equal(byId(525574).startsAt.toISOString(), EVENTS.find((e) => e.id === "evt_resume")!.startsAt);
    assert.equal(byId(521824).endsAt!.toISOString(), "2026-11-16T19:30:00.000Z");
    assert.equal(byId(513730).endsAt, null); // Weekday Noon Mass has no end time
  });

  test("[edge] an all-day event runs to the next Pacific midnight, not two hours", () => {
    const exhibit = byId(521345); // all-day, LiveWhale gives 08:00 UTC and no end
    assert.equal(exhibit.startsAt.toISOString(), "2026-11-16T08:00:00.000Z");
    assert.equal(exhibit.endsAt!.toISOString(), "2026-11-17T08:00:00.000Z");
  });

  test("[normal] HTML-escaped text is decoded and HTML descriptions become plain, cleaned text", () => {
    assert.equal(byId(525574).organizer, "Career Center");
    assert.equal(byId(521345).organizer, "Arts & Sciences");
    assert.match(byId(524983).title, /^Digital Archives, Liminality & Voice/);
    for (const event of parseLiveWhale(captured).events) {
      if (event.description === null) continue;
      assert.ok(!/<[a-z/][^>]*>/i.test(event.description), `${event.externalId} still has a tag`);
      assert.ok(!/&(amp|nbsp|lt|gt|quot);/.test(event.description), `${event.externalId} still has an entity`);
      assert.ok([...event.description].length <= 2000, `${event.externalId} is over 2,000`);
    }
    assert.equal(decodeEntities("Q&amp;A &#8211; &#x2014; &rsquo;"), "Q&A – — ’");
    assert.equal(htmlToText("<p>One<br />two</p><p>three &amp; four</p>").trim(), "One\ntwo\n\nthree & four");
  });

  test("[edge] a description over the 2,000-character column is cut with an ellipsis, not dropped", () => {
    const long = byId(506623);
    assert.equal([...long.description!].length, 2000);
    assert.ok(long.description!.endsWith("…"));
  });

  test("[normal] coordinates, location, registration and categories come through", () => {
    const resume = byId(525574);
    assert.deepEqual([resume.location, resume.category], ["Benson Indoor Plaza", "career"]);
    assert.equal(typeof byId(506623).lat, "number");
    assert.equal(byId(360170).location, "Location to be announced"); // Timesheet Due Date has none
    assert.equal(byId(513730).category, "reslife");
    // "Gardens: For Food and Medicine" is a course, not free food: titles are never classified.
    assert.equal(byId(505938).category, "study");
    assert.equal(byId(521824).signupUrl, captured.data.find((e) => e.id === 521824)!.url);
    assert.equal(byId(525574).signupUrl, null);
  });

  test("[invalid] canceled, not-live and incomplete events are skipped with a reason", () => {
    const response = copy();
    response.data[0]!.is_canceled = 1;
    response.data[1]!.status = 0;
    response.data[2]!.title = "  ";
    response.data[3]!.date_utc = null;
    const { events, skipped } = parseLiveWhale(response);
    assert.equal(events.length, 16);
    assert.deepEqual(
      skipped.map((skip) => skip.reason),
      ["canceled", "not live", "incomplete", "incomplete"],
    );
  });
});

describe("importLiveWhale writes through EventSource", () => {
  const importer = db as unknown as ImporterDb;
  beforeEach(() => {
    db.reset();
    db.clock = () => NOW;
  });

  test("[normal] creates one LIVEWHALE source and lands every event as PENDING", async () => {
    const result = await importLiveWhale(importer, LIVEWHALE_FEED_URL, captured, NOW);
    assert.deepEqual([result.created, result.updated, result.skipped.length], [20, 0, 0]);
    assert.equal(db.tables.eventSource.length, 1);
    const source = db.tables.eventSource[0]!;
    assert.deepEqual([source.type, source.url, source.label], ["LIVEWHALE", LIVEWHALE_FEED_URL, "SCU's events calendar"]);
    assert.equal(source.lastRunAt.toISOString(), NOW.toISOString());
    assert.ok(db.tables.campusEvent.every((event) => event.reviewStatus === "PENDING" && event.sourceId === source.id));
  });

  test("[edge] re-importing updates rows instead of duplicating, and keeps review status and RSVPs", async () => {
    await importLiveWhale(importer, LIVEWHALE_FEED_URL, captured, NOW);
    const resume = db.tables.campusEvent.find((event) => event.externalId === "525574")!;
    resume.reviewStatus = "APPROVED";
    resume.goingCount = 17;

    const changed = copy();
    changed.data.find((e) => e.id === 525574)!.title = "Week 9- Resume Refresh (Moved)";
    const again = await importLiveWhale(importer, LIVEWHALE_FEED_URL, changed, NOW);

    assert.deepEqual([again.created, again.updated], [0, 20]);
    assert.equal(db.tables.campusEvent.length, 20);
    assert.equal(db.tables.eventSource.length, 1);
    const after = db.tables.campusEvent.find((event) => event.externalId === "525574")!;
    assert.deepEqual([after.title, after.reviewStatus, after.goingCount], ["Week 9- Resume Refresh (Moved)", "APPROVED", 17]);
  });

  test("[edge] a different feed URL is a different source, so the same ids do not collide", async () => {
    await importLiveWhale(importer, LIVEWHALE_FEED_URL, captured, NOW);
    await importLiveWhale(importer, "https://events.scu.edu/live/json/events/group/osher", captured, NOW);
    assert.equal(db.tables.eventSource.length, 2);
    assert.equal(db.tables.campusEvent.length, 40);
  });
});
