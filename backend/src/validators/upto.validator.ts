/**
 * Up-Tos — plans students post themselves (Lab 4: UpTo, Lab 5: UpTo.test.ts).
 *
 * Also holds the report and Up-To RSVP schemas Lab 5 tests alongside it. The
 * report schema is the one Drops reuse.
 */
import { z } from "zod";
import { latitude, longitude } from "./drops.validator.js";

export const DESCRIPTION_MAX = 2000;
export const REPORT_DETAILS_MAX = 500;
export const PHONE_DIGITS_MIN = 7;
export const PHONE_DIGITS_MAX = 15;
export const REPORT_REASONS = [
  "ABOUT_A_PERSON",
  "THREAT",
  "HATE",
  "SEXUAL",
  "SPAM",
  "OTHER",
] as const;

function bodyError(iss: { code: string; keys?: string[] }) {
  if (iss.code === "unrecognized_keys") return `unexpected field: ${iss.keys!.join(", ")}`;
  if (iss.code === "invalid_type") return "body must be an object";
  return undefined;
}

const emailSchema = z.email();
/** Digits plus the punctuation people format phone numbers with. */
const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

/** How the share page should treat a contact string, or null if it is neither. */
export function classifyContact(input: unknown): "email" | "phone" | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value === "") return null;
  if (emailSchema.safeParse(value).success) return "email";
  if (PHONE_SHAPE.test(value)) {
    const digits = value.replace(/\D/g, "").length;
    if (digits >= PHONE_DIGITS_MIN && digits <= PHONE_DIGITS_MAX) return "phone";
  }
  return null;
}

/**
 * Zero-width, bidi-control and other invisible characters, plus C0 controls
 * other than tab and newline. A zero-width joiner between two pictographs is
 * kept, because it is part of an emoji such as a family or a profession.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|(?<!\p{Extended_Pictographic}\uFE0F?)\u200D|\u200D(?!\p{Extended_Pictographic})/gu;

/**
 * Normalise line endings, strip invisible characters, drop trailing spaces on
 * each line, collapse runs of blank lines to one, and trim the whole text.
 */
export function cleanDescription(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Missing, null and blank all become null: "no description". */
export const description = z
  .string({ error: "description must be text" })
  .nullish()
  .transform((value) => {
    if (value == null) return null;
    const cleaned = cleanDescription(value);
    return cleaned === "" ? null : cleaned;
  })
  .refine((value) => value === null || [...value].length <= DESCRIPTION_MAX, {
    error: `description must be at most ${DESCRIPTION_MAX} characters`,
  });

/**
 * Messages are user-facing: Liz's form renders error.message under the field.
 * title, location and scheduledAt use the same words as her fixture-mode mock,
 * so switching the web app to the real API changes no copy. Messages pinned by
 * lab-tests/UpTo.test.ts (description, report, RSVP) are left as they are.
 */
export const createUpToSchema = z
  .object(
    {
      title: z
        .string({ error: "Give it a title." })
        .trim()
        .min(1, { error: "Give it a title." })
        .max(200, { error: "Keep the title to 200 characters." }),
      description,
      scheduledAt: z.iso.datetime({ error: "Pick a time." }),
      location: z
        .string({ error: "Say where it is." })
        .trim()
        .min(1, { error: "Say where it is." })
        .max(200, { error: "Keep the location to 200 characters." }),
      contact: z
        .string({ error: "Add an email address or a phone number." })
        .trim()
        .max(254, { error: "That contact is too long." })
        .refine((value) => classifyContact(value) !== null, {
          error: "Use an email address, or a phone number with 7 to 15 digits.",
        })
        .optional(),
      lat: latitude.optional(),
      lng: longitude.optional(),
      publish: z.boolean({ error: "Choose whether to post it now." }).optional(),
    },
    { error: bodyError },
  )
  .strict();

export const submitReportSchema = z
  .object(
    {
      reason: z.enum(REPORT_REASONS, {
        error: `reason must be one of ${REPORT_REASONS.join(", ")}`,
      }),
      details: z
        .string({ error: "Write the details as text." })
        .max(REPORT_DETAILS_MAX, {
          error: `details must be at most ${REPORT_DETAILS_MAX} characters`,
        })
        .optional(),
    },
    { error: bodyError },
  )
  .strict();

export const upToRsvpSchema = z
  .object(
    {
      status: z.literal("GOING", { error: "status must be GOING" }),
      anonymous: z.boolean({ error: "anonymous must be true or false" }).optional(),
    },
    { error: bodyError },
  )
  .strict();

export type CreateUpToInput = z.infer<typeof createUpToSchema>;
export type SubmitReportInput = z.infer<typeof submitReportSchema>;
export type UpToRsvpInput = z.infer<typeof upToRsvpSchema>;
