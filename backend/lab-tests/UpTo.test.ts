import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyContact,
  cleanDescription,
  createUpToSchema,
  description,
  submitReportSchema,
  upToRsvpSchema,
} from "../src/validators/upto.validator.js";
import { accepts, rejects } from "./support/rejects.js";

const upTo = {
  title: "Boba run",
  scheduledAt: "2026-11-20T23:00:00.000Z",
  location: "Benson Center",
};

const DESCRIPTION_LENGTH = "description must be at most 2000 characters";

describe("UpTo", () => {
  it("[normal] classifyContact recognises an email and a formatted phone number", () => {
    assert.equal(classifyContact("bronco@scu.edu"), "email");
    assert.equal(classifyContact("  Bronco.Fan+boba@Gmail.com "), "email");
    assert.equal(classifyContact("(408) 554-4000"), "phone");
    assert.equal(classifyContact("+1 408.554.4000"), "phone");
    assert.equal(classifyContact("408-554-4000"), "phone");
  });

  it("[edge] phone digit boundaries: 7 and 15 digits pass, 6 and 16 fail", () => {
    assert.equal(classifyContact("554-4000"), "phone"); // 7
    assert.equal(classifyContact("+123 456 789 012 345"), "phone"); // 15
    assert.equal(classifyContact("554-400"), null); // 6
    assert.equal(classifyContact("+1234 5678 9012 3456"), null); // 16
  });

  it("[invalid] classifyContact returns null for blank or garbage input", () => {
    for (const input of ["", "   ", "\n\t", "hello", "call me maybe", "@scu.edu", "bronco@", "408-CALL-NOW", "++4085544000", "12ab345678"]) {
      assert.equal(classifyContact(input), null, JSON.stringify(input));
    }
    for (const input of [null, undefined, 4085544000, {}, []]) {
      assert.equal(classifyContact(input), null, String(input));
    }
  });

  it("[normal] description cleans line endings, invisible characters and extra blank lines", () => {
    assert.equal(cleanDescription("line one\r\nline two\rline three"), "line one\nline two\nline three");
    assert.equal(cleanDescription("bo\u200Bba\uFEFF run\u200E\u00AD"), "boba run");
    assert.equal(cleanDescription("first\n\n\n\n\nsecond\n \t \n\n third"), "first\n\nsecond\n\n third");
    assert.equal(cleanDescription("  \n trailing spaces   \nhere\t\n\n"), "trailing spaces\nhere");
    // A zero-width joiner inside an emoji is part of the emoji and is kept.
    assert.equal(cleanDescription("family 👨\u200D👩\u200D👧 trip"), "family 👨\u200D👩\u200D👧 trip");
    const parsed = accepts(createUpToSchema, { ...upTo, description: "Meet\r\n\r\n\r\n\r\nat the\u200B fountain " });
    assert.equal(parsed.description, "Meet\n\nat the fountain");
  });

  it("[edge] description: missing, null and blank all mean 'no description'", () => {
    assert.equal(accepts(createUpToSchema, upTo).description, null);
    assert.equal(accepts(createUpToSchema, { ...upTo, description: null }).description, null);
    assert.equal(accepts(createUpToSchema, { ...upTo, description: "" }).description, null);
    assert.equal(accepts(createUpToSchema, { ...upTo, description: "  \r\n\t \n " }).description, null);
    assert.equal(accepts(createUpToSchema, { ...upTo, description: "\u200B\uFEFF" }).description, null);
  });

  it("[edge/invalid] description length: 2,000 characters pass, 2,001 and a 100,000-character text fail", () => {
    assert.equal(accepts(description, "d".repeat(2000))?.length, 2000);
    // Measured after cleaning: invisible padding does not count against the limit.
    assert.equal(accepts(description, `${"d".repeat(2000)}\u200B\u200B  \n\n`)?.length, 2000);
    rejects(description, "d".repeat(2001), DESCRIPTION_LENGTH);
    rejects(description, "d".repeat(100_000), DESCRIPTION_LENGTH);
    rejects(createUpToSchema, { ...upTo, description: "d".repeat(2001) }, DESCRIPTION_LENGTH);
  });

  it("[invalid] description of the wrong type (a number) is rejected", () => {
    rejects(createUpToSchema, { ...upTo, description: 42 }, "description must be text");
    rejects(createUpToSchema, { ...upTo, description: ["a", "b"] }, "description must be text");
    rejects(createUpToSchema, { ...upTo, description: { text: "a" } }, "description must be text");
  });

  it("[edge/invalid] report: details up to 500 characters, reason must be an exact value", () => {
    assert.deepEqual(accepts(submitReportSchema, { reason: "SPAM" }), { reason: "SPAM" });
    for (const reason of ["ABOUT_A_PERSON", "THREAT", "HATE", "SEXUAL", "SPAM", "OTHER"]) {
      accepts(submitReportSchema, { reason, details: "x".repeat(500) });
    }
    rejects(submitReportSchema, { reason: "SPAM", details: "x".repeat(501) }, "details must be at most 500 characters");
    const REASON = "reason must be one of ABOUT_A_PERSON, THREAT, HATE, SEXUAL, SPAM, OTHER";
    for (const reason of ["spam", " SPAM", "SPAM ", "Spam", "RUDE", "", null, 3]) {
      rejects(submitReportSchema, { reason }, REASON);
    }
    rejects(submitReportSchema, { reason: "SPAM", reporterId: "user_1" }, "unexpected field: reporterId");
  });

  it("[normal/invalid] RSVP: GOING with anonymity accepted; MAYBE or a string 'true' rejected", () => {
    assert.deepEqual(accepts(upToRsvpSchema, { status: "GOING" }), { status: "GOING" });
    assert.deepEqual(accepts(upToRsvpSchema, { status: "GOING", anonymous: true }), { status: "GOING", anonymous: true });
    assert.deepEqual(accepts(upToRsvpSchema, { status: "GOING", anonymous: false }), { status: "GOING", anonymous: false });
    rejects(upToRsvpSchema, { status: "MAYBE" }, "status must be GOING");
    rejects(upToRsvpSchema, { status: "going" }, "status must be GOING");
    rejects(upToRsvpSchema, { status: "GOING", anonymous: "true" }, "anonymous must be true or false");
    rejects(upToRsvpSchema, { status: "GOING", anonymous: 1 }, "anonymous must be true or false");
  });
});
