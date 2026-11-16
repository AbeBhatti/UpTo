import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countGraphemes,
  createDropSchema,
  normalizeDropText,
  rulesAgreementSchema,
  voteDropSchema,
} from "../src/validators/drops.validator.js";
import { accepts, rejects } from "./support/rejects.js";

const valid = {
  category: "FREE_FOOD",
  text: "Pizza at Benson",
  lat: 37.3496,
  lng: -121.9390,
  clientRef: "c1a2b3c4-d5e6",
};

const TEXT_LENGTH = "text must be 3 to 80 characters";

describe("Drop", () => {
  it("[normal] accepts a complete, valid drop", () => {
    assert.deepEqual(accepts(createDropSchema, valid), valid);
    for (const category of ["FREE_FOOD", "POP_UP", "RANDOM"]) {
      assert.equal(accepts(createDropSchema, { ...valid, category }).category, category);
    }
    const { clientRef: _, ...withoutRef } = valid;
    assert.equal(accepts(createDropSchema, withoutRef).clientRef, undefined);
  });

  it("[normal] tidies extra spaces in the text before saving it", () => {
    assert.equal(normalizeDropText("  free \t tacos\n\n by   Locatelli  "), "free tacos by Locatelli");
    const parsed = accepts(createDropSchema, { ...valid, text: "  free \t tacos\n by   Locatelli  " });
    assert.equal(parsed.text, "free tacos by Locatelli");
    // Measured after tidying: three spaced letters are 3 characters, not 9.
    assert.equal(accepts(createDropSchema, { ...valid, text: "  a   b  " }).text, "a b");
    rejects(createDropSchema, { ...valid, text: "  ab      " }, TEXT_LENGTH);
  });

  it("[edge] text length boundaries: 3 and 80 characters pass, 2 and 81 fail", () => {
    accepts(createDropSchema, { ...valid, text: "abc" });
    accepts(createDropSchema, { ...valid, text: "a".repeat(80) });
    rejects(createDropSchema, { ...valid, text: "ab" }, TEXT_LENGTH);
    rejects(createDropSchema, { ...valid, text: "a".repeat(81) }, TEXT_LENGTH);
    rejects(createDropSchema, { ...valid, text: "" }, TEXT_LENGTH);
  });

  it("[edge] an emoji with a skin tone counts as one character", () => {
    const wave = "\u{1F44B}\u{1F3FD}"; // 👋🏽: two code points, four UTF-16 units
    assert.equal(wave.length, 4);
    assert.equal(countGraphemes(wave), 1);
    assert.equal(countGraphemes(`hi${wave}`), 3);
    accepts(createDropSchema, { ...valid, text: `hi${wave}` });
    accepts(createDropSchema, { ...valid, text: wave.repeat(80) });
    rejects(createDropSchema, { ...valid, text: wave.repeat(81) }, TEXT_LENGTH);
    rejects(createDropSchema, { ...valid, text: `a${wave}` }, TEXT_LENGTH);
  });

  it("[edge] coordinates exactly on the limits are accepted", () => {
    for (const [lat, lng] of [[90, 180], [-90, -180], [90, -180], [-90, 180], [0, 0]]) {
      const parsed = accepts(createDropSchema, { ...valid, lat, lng });
      assert.equal(parsed.lat, lat);
      assert.equal(parsed.lng, lng);
    }
  });

  it("[invalid] coordinates just outside the limits, NaN or Infinity are rejected", () => {
    rejects(createDropSchema, { ...valid, lat: 90.000001 }, "lat must be between -90 and 90");
    rejects(createDropSchema, { ...valid, lat: -90.000001 }, "lat must be between -90 and 90");
    rejects(createDropSchema, { ...valid, lng: 180.000001 }, "lng must be between -180 and 180");
    rejects(createDropSchema, { ...valid, lng: -180.000001 }, "lng must be between -180 and 180");
    rejects(createDropSchema, { ...valid, lat: NaN }, "lat must be a finite number");
    rejects(createDropSchema, { ...valid, lng: NaN }, "lng must be a finite number");
    rejects(createDropSchema, { ...valid, lat: Infinity }, "lat must be a finite number");
    rejects(createDropSchema, { ...valid, lng: -Infinity }, "lng must be a finite number");
  });

  it("[invalid] wrong types and None/null values are rejected", () => {
    rejects(createDropSchema, { ...valid, text: 12345 }, "text must be a string");
    rejects(createDropSchema, { ...valid, text: null }, "text must be a string");
    rejects(createDropSchema, { ...valid, lat: "37.3" }, "lat must be a finite number");
    rejects(createDropSchema, { ...valid, lng: null }, "lng must be a finite number");
    rejects(createDropSchema, { ...valid, category: "free_food" }, "category must be FREE_FOOD, POP_UP or RANDOM");
    rejects(createDropSchema, { ...valid, category: null }, "category must be FREE_FOOD, POP_UP or RANDOM");
    rejects(createDropSchema, { ...valid, clientRef: "short" }, "clientRef must be 8 to 64 letters, digits, _ or -");
    rejects(createDropSchema, { ...valid, clientRef: "has spaces in it" }, "clientRef must be 8 to 64 letters, digits, _ or -");
    rejects(createDropSchema, { ...valid, clientRef: "x".repeat(65) }, "clientRef must be 8 to 64 letters, digits, _ or -");
    rejects(createDropSchema, null, "body must be an object");
  });

  it("[invalid] a very large text (10,000 characters) is rejected", () => {
    rejects(createDropSchema, { ...valid, text: "a".repeat(10_000) }, TEXT_LENGTH);
    rejects(createDropSchema, { ...valid, text: "free food ".repeat(1_000) }, TEXT_LENGTH);
  });

  it("[invalid] a client cannot set server-owned fields like authorId", () => {
    rejects(createDropSchema, { ...valid, authorId: "user_123" }, "unexpected field: authorId");
    rejects(createDropSchema, { ...valid, expiresAt: "2026-12-01T00:00:00Z" }, "unexpected field: expiresAt");
    rejects(createDropSchema, { ...valid, createdAt: "2026-11-01T00:00:00Z" }, "unexpected field: createdAt");
    rejects(createDropSchema, { ...valid, id: "drop_1" }, "unexpected field: id");
  });

  it("[normal/edge] votes: HERE and GONE count, null withdraws a vote, anything else fails", () => {
    assert.deepEqual(accepts(voteDropSchema, { vote: "HERE" }), { vote: "HERE" });
    assert.deepEqual(accepts(voteDropSchema, { vote: "GONE" }), { vote: "GONE" });
    assert.deepEqual(accepts(voteDropSchema, { vote: null }), { vote: null });
    const VOTE = "vote must be HERE, GONE or null";
    rejects(voteDropSchema, { vote: "here" }, VOTE);
    rejects(voteDropSchema, { vote: "MAYBE" }, VOTE);
    rejects(voteDropSchema, { vote: true }, VOTE);
    rejects(voteDropSchema, { vote: 1 }, VOTE);
    rejects(voteDropSchema, {}, VOTE);
    rejects(voteDropSchema, { vote: "HERE", userId: "user_123" }, "unexpected field: userId");
  });

  it("[edge/invalid] rules agreement: versions 1 to 2 only, whole numbers only", () => {
    assert.deepEqual(accepts(rulesAgreementSchema, { rulesVersion: 1 }), { rulesVersion: 1 });
    assert.deepEqual(accepts(rulesAgreementSchema, { rulesVersion: 2 }), { rulesVersion: 2 });
    rejects(rulesAgreementSchema, { rulesVersion: 0 }, "rulesVersion must be 1 to 2");
    rejects(rulesAgreementSchema, { rulesVersion: 3 }, "rulesVersion must be 1 to 2");
    rejects(rulesAgreementSchema, { rulesVersion: 1.5 }, "rulesVersion must be a whole number");
    rejects(rulesAgreementSchema, { rulesVersion: "2" }, "rulesVersion must be a number");
    rejects(rulesAgreementSchema, { rulesVersion: null }, "rulesVersion must be a number");
  });
});
