/**
 * Drops — quick map pins (Lab 4: Drop, Lab 5: Drop.test.ts).
 *
 * Every object schema is `.strict()`: a body carrying a server-owned field
 * such as `authorId` or `expiresAt` is a 400, not a silently ignored key.
 */
import { z } from "zod";

export const DROP_CATEGORIES = ["FREE_FOOD", "POP_UP", "RANDOM"] as const;
export const DROP_VOTE_KINDS = ["HERE", "GONE"] as const;

export const DROP_TEXT_MIN = 3;
export const DROP_TEXT_MAX = 80;
/** The current rules version. Agreements to 1 through this are accepted. */
export const DROPS_RULES_VERSION = 2;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** User-perceived characters. An emoji with a skin-tone modifier is one. */
export function countGraphemes(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

/** What is stored, and therefore what is measured: NFC, single spaces, trimmed. */
export function normalizeDropText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function bodyError(iss: { code: string; keys?: string[] }) {
  if (iss.code === "unrecognized_keys") return `unexpected field: ${iss.keys!.join(", ")}`;
  if (iss.code === "invalid_type") return "body must be an object";
  return undefined;
}

export const latitude = z
  .number({ error: "lat must be a finite number" })
  .min(-90, { error: "lat must be between -90 and 90" })
  .max(90, { error: "lat must be between -90 and 90" });

export const longitude = z
  .number({ error: "lng must be a finite number" })
  .min(-180, { error: "lng must be between -180 and 180" })
  .max(180, { error: "lng must be between -180 and 180" });

const dropText = z
  .string({ error: "text must be a string" })
  .transform(normalizeDropText)
  .refine(
    (text) => {
      const n = countGraphemes(text);
      return n >= DROP_TEXT_MIN && n <= DROP_TEXT_MAX;
    },
    { error: `text must be ${DROP_TEXT_MIN} to ${DROP_TEXT_MAX} characters` },
  );

export const createDropSchema = z
  .object(
    {
      category: z.enum(DROP_CATEGORIES, {
        error: "category must be FREE_FOOD, POP_UP or RANDOM",
      }),
      text: dropText,
      lat: latitude,
      lng: longitude,
      clientRef: z
        .string({ error: "clientRef must be a string" })
        .regex(/^[A-Za-z0-9_-]{8,64}$/, {
          error: "clientRef must be 8 to 64 letters, digits, _ or -",
        })
        .optional(),
    },
    { error: bodyError },
  )
  .strict();

/** `null` withdraws the vote; the key itself is required. */
export const voteDropSchema = z
  .object(
    {
      vote: z.enum(DROP_VOTE_KINDS, { error: "vote must be HERE, GONE or null" }).nullable(),
    },
    { error: bodyError },
  )
  .strict();

export const rulesAgreementSchema = z
  .object(
    {
      rulesVersion: z
        .number({ error: "rulesVersion must be a number" })
        .int({ error: "rulesVersion must be a whole number" })
        .min(1, { error: `rulesVersion must be 1 to ${DROPS_RULES_VERSION}` })
        .max(DROPS_RULES_VERSION, { error: `rulesVersion must be 1 to ${DROPS_RULES_VERSION}` }),
    },
    { error: bodyError },
  )
  .strict();

export type CreateDropInput = z.infer<typeof createDropSchema>;
export type VoteDropInput = z.infer<typeof voteDropSchema>;
export type RulesAgreementInput = z.infer<typeof rulesAgreementSchema>;
