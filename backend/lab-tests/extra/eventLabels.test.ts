/**
 * The frontend contract, checked directly.
 *
 * fixtures/events.ts holds the exact `timeLabel`, `isLiveNow` and `signup`
 * values Home was built against, computed relative to its NOW. This feeds
 * each fixture event's RAW fields (start, end, the three sign-up columns)
 * through the server's computed functions with the clock pinned to NOW, and
 * requires the server to produce those values exactly. If a label changes on
 * either side, this fails before integration day does.
 *
 *   npx tsx --test --test-reporter=spec lab-tests/extra/eventLabels.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVENTS, NOW } from "@upto/fixtures";
import {
  campusMidnight,
  campusDay,
  isLiveNow,
  signupFor,
  timeLabel,
} from "../../src/services/events/computed.js";

const now = new Date(NOW);
const date = (iso: string | null) => (iso === null ? null : new Date(iso));

describe("computed event fields match fixtures/events.ts at its NOW", () => {
  for (const fixture of EVENTS) {
    const times = { startsAt: new Date(fixture.startsAt), endsAt: date(fixture.endsAt) };

    it(`${fixture.id}: timeLabel "${fixture.timeLabel}", isLiveNow ${fixture.isLiveNow}`, () => {
      assert.equal(timeLabel(times, now), fixture.timeLabel);
      assert.equal(isLiveNow(times, now), fixture.isLiveNow);
    });

    it(`${fixture.id}: signup ${fixture.signup.state}`, () => {
      const signup = signupFor(
        {
          signupUrl: fixture.signup.url,
          signupOpensAt: date(fixture.signup.opensAt),
          signupClosesAt: date(fixture.signup.closesAt),
        },
        now,
      );
      assert.deepEqual(signup, fixture.signup);
    });
  }
});

describe("computed event fields beyond the fixtures", () => {
  const at = (iso: string) => new Date(iso);
  const event = (startsAt: string, endsAt: string | null = null) => ({ startsAt: at(startsAt), endsAt: endsAt ? at(endsAt) : null });

  it("[edge] isLiveNow: live from the exact start instant, over at the exact end instant", () => {
    assert.equal(isLiveNow(event("2026-11-15T21:00:00Z", "2026-11-15T22:00:00Z"), at("2026-11-15T21:00:00Z")), true);
    assert.equal(isLiveNow(event("2026-11-15T21:00:00Z", "2026-11-15T22:00:00Z"), at("2026-11-15T22:00:00Z")), false);
    assert.equal(isLiveNow(event("2026-11-15T21:00:01Z"), at("2026-11-15T21:00:00Z")), false);
  });

  it("[edge] countdown rounds down and reaches minutes", () => {
    const now = at("2026-11-15T21:00:00Z");
    assert.equal(timeLabel(event("2026-11-15T20:00:00Z", "2026-11-15T23:59:00Z"), now), "2 hrs left");
    assert.equal(timeLabel(event("2026-11-15T20:00:00Z", "2026-11-15T22:30:00Z"), now), "1 hr left");
    assert.equal(timeLabel(event("2026-11-15T20:00:00Z", "2026-11-15T21:45:00Z"), now), "45 min left");
    assert.equal(timeLabel(event("2026-11-15T20:00:00Z", "2026-11-16T00:00:00Z"), now), "Until 4:00 p.m.");
  });

  it("[edge] noon, midnight, and seven days out is a date rather than a weekday", () => {
    const now = at("2026-11-15T21:00:00Z"); // Sun 1:00 p.m. PT
    assert.equal(timeLabel(event("2026-11-16T20:00:00Z"), now), "Tomorrow 12:00 p.m.");
    assert.equal(timeLabel(event("2026-11-17T08:00:00Z"), now), "Tue 12:00 a.m.");
    assert.equal(timeLabel(event("2026-11-22T17:00:00Z"), now), "Nov 22, 9:00 a.m.");
  });

  it("[edge] sign-up deadlines and openings at their exact instants", () => {
    const fields = { signupUrl: "https://forms.gle/x", signupOpensAt: at("2026-11-15T21:00:00Z"), signupClosesAt: at("2026-11-15T22:00:00Z") };
    assert.equal(signupFor(fields, at("2026-11-15T21:00:00Z")).state, "OPEN");
    assert.equal(signupFor(fields, at("2026-11-15T20:59:59Z")).state, "OPENS_LATER");
    assert.equal(signupFor(fields, at("2026-11-15T22:00:00Z")).state, "CLOSED");
  });

  it("[edge] Pacific day boundaries hold across the November DST change", () => {
    // 1 Nov 2026 is the fall-back day: midnight is still PDT (07:00Z), the next is PST (08:00Z).
    assert.equal(campusMidnight(campusDay(at("2026-11-01T12:00:00Z"))).toISOString(), "2026-11-01T07:00:00.000Z");
    assert.equal(campusMidnight(campusDay(at("2026-11-02T12:00:00Z"))).toISOString(), "2026-11-02T08:00:00.000Z");
  });
});
