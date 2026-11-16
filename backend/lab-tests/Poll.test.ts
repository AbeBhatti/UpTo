import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPollSchema, respondPollSchema } from "../src/validators/poll.validator.js";
import { accepts, rejects } from "./support/rejects.js";

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Slot ${i + 1}`, order: i }));
const responses = (n: number) => Array.from({ length: n }, (_, i) => ({ slotId: `slot_${i}`, available: true }));

const SLOT_COUNT = "a poll needs 2 to 20 slots";
const QUESTION_LENGTH = "question must be 1 to 280 characters";
const RESPONSE_COUNT = "responses must have 1 to 20 entries";

describe("Poll", () => {
  it("[normal] accepts a question with two slots and trims the question", () => {
    const parsed = accepts(createPollSchema, {
      question: "   When works for boba?  ",
      slots: [{ label: "Fri 4 PM", order: 0 }, { label: "Sat noon", order: 1 }],
    });
    assert.deepEqual(parsed, {
      question: "When works for boba?",
      slots: [{ label: "Fri 4 PM", order: 0 }, { label: "Sat noon", order: 1 }],
    });
  });

  it("[edge] slot count boundaries: 2 and 20 pass, 1 and 21 fail", () => {
    assert.equal(accepts(createPollSchema, { question: "When?", slots: slots(2) }).slots.length, 2);
    assert.equal(accepts(createPollSchema, { question: "When?", slots: slots(20) }).slots.length, 20);
    rejects(createPollSchema, { question: "When?", slots: slots(1) }, SLOT_COUNT);
    rejects(createPollSchema, { question: "When?", slots: slots(21) }, SLOT_COUNT);
    rejects(createPollSchema, { question: "When?", slots: [] }, SLOT_COUNT);
  });

  it("[edge] question length boundaries: 280 passes, 281 fails, spaces only fails", () => {
    assert.equal(accepts(createPollSchema, { question: "q".repeat(280), slots: slots(2) }).question.length, 280);
    // Trimmed before measuring: 280 characters with padding still passes.
    accepts(createPollSchema, { question: `  ${"q".repeat(280)}  `, slots: slots(2) });
    rejects(createPollSchema, { question: "q".repeat(281), slots: slots(2) }, QUESTION_LENGTH);
    rejects(createPollSchema, { question: "     ", slots: slots(2) }, QUESTION_LENGTH);
    rejects(createPollSchema, { question: "\n\t ", slots: slots(2) }, QUESTION_LENGTH);
  });

  it("[edge] slot order may be 0 or left out, but not negative or a fraction", () => {
    const zero = accepts(createPollSchema, { question: "When?", slots: [{ label: "A", order: 0 }, { label: "B", order: 7 }] });
    assert.equal(zero.slots[0].order, 0);
    const omitted = accepts(createPollSchema, { question: "When?", slots: [{ label: "A" }, { label: "B" }] });
    assert.equal(omitted.slots[0].order, undefined);
    rejects(createPollSchema, { question: "When?", slots: [{ label: "A", order: -1 }, { label: "B" }] }, "slot order must be 0 or more");
    rejects(createPollSchema, { question: "When?", slots: [{ label: "A", order: 1.5 }, { label: "B" }] }, "slot order must be a whole number");
    rejects(createPollSchema, { question: "When?", slots: [{ label: "A", order: "1" }, { label: "B" }] }, "slot order must be a number");
  });

  it("[invalid] slots that are None/null, a string, or have empty labels are rejected", () => {
    rejects(createPollSchema, { question: "When?", slots: null }, "slots must be a list");
    rejects(createPollSchema, { question: "When?", slots: "Fri, Sat" }, "slots must be a list");
    rejects(createPollSchema, { question: "When?", slots: [null, { label: "B" }] }, "each slot must be an object");
    rejects(createPollSchema, { question: "When?", slots: [{ label: "" }, { label: "B" }] }, "slot label must be 1 to 120 characters");
    rejects(createPollSchema, { question: "When?", slots: [{ label: "   " }, { label: "B" }] }, "slot label must be 1 to 120 characters");
    rejects(createPollSchema, { question: "When?", slots: [{ label: "x".repeat(121) }, { label: "B" }] }, "slot label must be 1 to 120 characters");
    rejects(createPollSchema, { question: "When?", slots: [{ label: null }, { label: "B" }] }, "slot label must be a string");
  });

  it("[normal] a single response to one slot is accepted", () => {
    assert.deepEqual(accepts(respondPollSchema, { responses: [{ slotId: "slot_1", available: true }] }), {
      responses: [{ slotId: "slot_1", available: true }],
    });
    accepts(respondPollSchema, { responses: [{ slotId: "slot_1", available: false }] });
  });

  it("[invalid] responses: empty list, wrong type, and a huge list (1,000) are rejected", () => {
    rejects(respondPollSchema, { responses: [] }, RESPONSE_COUNT);
    rejects(respondPollSchema, { responses: "slot_1" }, "responses must be a list");
    rejects(respondPollSchema, { responses: null }, "responses must be a list");
    rejects(respondPollSchema, { responses: [{ slotId: "slot_1", available: "yes" }] }, "available must be true or false");
    rejects(respondPollSchema, { responses: ["slot_1"] }, "each response must be an object");
    rejects(respondPollSchema, { responses: responses(1_000) }, RESPONSE_COUNT);
    rejects(respondPollSchema, { responses: responses(21) }, RESPONSE_COUNT);
    assert.equal(accepts(respondPollSchema, { responses: responses(20) }).responses.length, 20);
  });
});
