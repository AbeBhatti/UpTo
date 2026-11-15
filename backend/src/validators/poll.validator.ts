/**
 * Polls — a time vote hanging off an Up-To (Lab 4: Poll, Lab 5: Poll.test.ts).
 */
import { z } from "zod";

export const POLL_QUESTION_MAX = 280;
export const POLL_SLOTS_MIN = 2;
export const POLL_SLOTS_MAX = 20;
export const POLL_SLOT_LABEL_MAX = 120;
export const POLL_RESPONSES_MAX = 20;
export const ID_MAX = 191;

function bodyError(iss: { code: string; keys?: string[] }) {
  if (iss.code === "unrecognized_keys") return `unexpected field: ${iss.keys!.join(", ")}`;
  if (iss.code === "invalid_type") return "body must be an object";
  return undefined;
}

function slotError(iss: { code: string; keys?: string[] }) {
  if (iss.code === "unrecognized_keys") return `unexpected field: ${iss.keys!.join(", ")}`;
  if (iss.code === "invalid_type") return "each slot must be an object";
  return undefined;
}

const pollSlot = z
  .object(
    {
      // Deliberate: labels are trimmed before the 1 to 120 check, like the
      // question. Lab 5 only says the question is trimmed, but it also says
      // empty labels fail, and an all-spaces label renders as empty.
      label: z
        .string({ error: "slot label must be a string" })
        .trim()
        .min(1, { error: `slot label must be 1 to ${POLL_SLOT_LABEL_MAX} characters` })
        .max(POLL_SLOT_LABEL_MAX, {
          error: `slot label must be 1 to ${POLL_SLOT_LABEL_MAX} characters`,
        }),
      order: z
        .number({ error: "slot order must be a number" })
        .int({ error: "slot order must be a whole number" })
        .min(0, { error: "slot order must be 0 or more" })
        .optional(),
    },
    { error: slotError },
  )
  .strict();

export const createPollSchema = z
  .object(
    {
      question: z
        .string({ error: "question must be a string" })
        .trim()
        .min(1, { error: `question must be 1 to ${POLL_QUESTION_MAX} characters` })
        .max(POLL_QUESTION_MAX, {
          error: `question must be 1 to ${POLL_QUESTION_MAX} characters`,
        }),
      slots: z
        .array(pollSlot, { error: "slots must be a list" })
        .min(POLL_SLOTS_MIN, { error: `a poll needs ${POLL_SLOTS_MIN} to ${POLL_SLOTS_MAX} slots` })
        .max(POLL_SLOTS_MAX, { error: `a poll needs ${POLL_SLOTS_MIN} to ${POLL_SLOTS_MAX} slots` }),
    },
    { error: bodyError },
  )
  .strict();

const pollResponse = z
  .object(
    {
      slotId: z
        .string({ error: "slotId must be a string" })
        .min(1, { error: "slotId must not be empty" })
        .max(ID_MAX, { error: `slotId must be at most ${ID_MAX} characters` }),
      available: z.boolean({ error: "available must be true or false" }),
    },
    { error: (iss) => (iss.code === "invalid_type" ? "each response must be an object" : bodyError(iss)) },
  )
  .strict();

export const respondPollSchema = z
  .object(
    {
      // Deliberate: duplicate slotIds are allowed here. Lab 5 does not mention
      // them, and the validator cannot see the poll anyway. PollResponse is
      // unique on (slotId, userId), so the service upserts and a repeat is
      // last-write-wins, never double-counted.
      responses: z
        .array(pollResponse, { error: "responses must be a list" })
        .min(1, { error: `responses must have 1 to ${POLL_RESPONSES_MAX} entries` })
        .max(POLL_RESPONSES_MAX, {
          error: `responses must have 1 to ${POLL_RESPONSES_MAX} entries`,
        }),
    },
    { error: bodyError },
  )
  .strict();

export type CreatePollInput = z.infer<typeof createPollSchema>;
export type RespondPollInput = z.infer<typeof respondPollSchema>;
