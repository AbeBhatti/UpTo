/**
 * createUpToSchema's `contact` field, which Lab 5's UpTo.test.ts never
 * exercised through the schema. classifyContact itself is covered there; this
 * checks the schema wires it in: optional, trimmed, 254 max, and only an
 * email or a 7-to-15-digit phone.
 *
 *   npx tsx --test --test-reporter=spec lab-tests/extra/UpToContact.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUpToSchema } from "../../src/validators/upto.validator.js";
import { accepts, rejects } from "../support/rejects.js";

const upTo = {
  title: "Boba run",
  scheduledAt: "2026-11-20T23:00:00.000Z",
  location: "Benson Center",
};

const CONTACT = "contact must be an email address or a phone number of 7 to 15 digits";

describe("UpTo contact", () => {
  it("[normal] contact is optional: leaving it out is accepted and stays absent", () => {
    assert.equal("contact" in accepts(createUpToSchema, upTo), false);
  });

  it("[normal] an email or a formatted phone is accepted, trimmed", () => {
    assert.equal(accepts(createUpToSchema, { ...upTo, contact: "  bronco@scu.edu " }).contact, "bronco@scu.edu");
    assert.equal(accepts(createUpToSchema, { ...upTo, contact: "(408) 554-4000" }).contact, "(408) 554-4000");
  });

  it("[edge] phone digit boundaries pass through the schema: 7 and 15 accepted, 6 and 16 rejected", () => {
    accepts(createUpToSchema, { ...upTo, contact: "554-4000" });
    accepts(createUpToSchema, { ...upTo, contact: "+123 456 789 012 345" });
    rejects(createUpToSchema, { ...upTo, contact: "554-400" }, CONTACT);
    rejects(createUpToSchema, { ...upTo, contact: "+1234 5678 9012 3456" }, CONTACT);
  });

  it("[edge] 254 characters is the most an email may be; 255 is rejected for length", () => {
    // Real DNS labels stop at 63 characters, so the domain is built from several.
    const email = (length: number) =>
      `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - 64 - 1 - 64 - 64 - 4)}.com`;
    assert.equal(email(254).length, 254);
    assert.equal(accepts(createUpToSchema, { ...upTo, contact: email(254) }).contact, email(254));
    rejects(createUpToSchema, { ...upTo, contact: email(255) }, "contact must be at most 254 characters");
  });

  it("[invalid] blank, garbage, null and non-string contacts are rejected", () => {
    for (const contact of ["", "   ", "call me maybe", "bronco@", "408-CALL-NOW"]) {
      rejects(createUpToSchema, { ...upTo, contact }, CONTACT);
    }
    rejects(createUpToSchema, { ...upTo, contact: null }, "contact must be a string");
    rejects(createUpToSchema, { ...upTo, contact: 4085544000 }, "contact must be a string");
  });
});
