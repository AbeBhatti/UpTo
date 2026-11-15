import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rsvpSchema, rsvpSyncSchema } from "../src/validators/campusEventRsvp.validator.js";
import { accepts, rejects } from "./support/rejects.js";

const STATUS = "status must be GOING, INTERESTED or NOT_GOING";
const BATCH = "eventIds must have 1 to 200 ids";
const ids = (n: number) => Array.from({ length: n }, (_, i) => `event_${i}`);

describe("Attendance", () => {
  it("[normal] each of the three statuses is accepted", () => {
    for (const status of ["GOING", "INTERESTED", "NOT_GOING"]) {
      assert.deepEqual(accepts(rsvpSchema, { status }), { status });
    }
  });

  it("[edge] status is case-insensitive and ignores surrounding spaces", () => {
    assert.equal(accepts(rsvpSchema, { status: "going" }).status, "GOING");
    assert.equal(accepts(rsvpSchema, { status: "  Interested\t" }).status, "INTERESTED");
    assert.equal(accepts(rsvpSchema, { status: " not_going " }).status, "NOT_GOING");
    assert.equal(accepts(rsvpSyncSchema, { eventIds: ["e1"], status: " gOiNg " }).status, "GOING");
  });

  it("[invalid] unknown status, a number, and None/null are rejected", () => {
    rejects(rsvpSchema, { status: "MAYBE" }, STATUS);
    rejects(rsvpSchema, { status: "not going" }, STATUS);
    rejects(rsvpSchema, { status: "" }, STATUS);
    rejects(rsvpSchema, { status: 1 }, STATUS);
    rejects(rsvpSchema, { status: null }, STATUS);
    rejects(rsvpSchema, {}, STATUS);
  });

  it("[invalid] the body must be an object, not null, a string or an array", () => {
    for (const body of [null, undefined, "GOING", ["GOING"], 42]) {
      rejects(rsvpSchema, body, "body must be an object");
      rejects(rsvpSyncSchema, body, "body must be an object");
    }
  });

  it("[invalid] a request cannot RSVP on behalf of another user", () => {
    rejects(rsvpSchema, { status: "GOING", userId: "someone_else" }, "unexpected field: userId");
    rejects(rsvpSyncSchema, { eventIds: ["e1"], status: "GOING", userId: "someone_else" }, "unexpected field: userId");
  });

  it("[edge] sync: a single id, and duplicate ids are kept only once", () => {
    assert.deepEqual(accepts(rsvpSyncSchema, { eventIds: ["e1"], status: "GOING" }), {
      eventIds: ["e1"],
      status: "GOING",
    });
    assert.deepEqual(
      accepts(rsvpSyncSchema, { eventIds: ["e2", "e1", "e2", "e3", "e1"], status: "INTERESTED" }).eventIds,
      ["e2", "e1", "e3"],
    );
  });

  it("[edge] sync batch size: exactly 200 ids pass, 201 fail", () => {
    assert.equal(accepts(rsvpSyncSchema, { eventIds: ids(200), status: "GOING" }).eventIds.length, 200);
    rejects(rsvpSyncSchema, { eventIds: ids(201), status: "GOING" }, BATCH);
    rejects(rsvpSyncSchema, { eventIds: [], status: "GOING" }, BATCH);
  });

  it("[edge/invalid] sync ids: 191 characters pass, 192 fail, empty or non-string ids fail", () => {
    accepts(rsvpSyncSchema, { eventIds: ["x".repeat(191)], status: "GOING" });
    rejects(rsvpSyncSchema, { eventIds: ["x".repeat(192)], status: "GOING" }, "event ids must be at most 191 characters");
    rejects(rsvpSyncSchema, { eventIds: [""], status: "GOING" }, "event ids must not be empty");
    rejects(rsvpSyncSchema, { eventIds: [42], status: "GOING" }, "each event id must be a string");
    rejects(rsvpSyncSchema, { eventIds: [null], status: "GOING" }, "each event id must be a string");
    rejects(rsvpSyncSchema, { eventIds: "e1", status: "GOING" }, "eventIds must be a list");
  });
});
