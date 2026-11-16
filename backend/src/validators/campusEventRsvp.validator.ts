/**
 * Campus event RSVPs (Lab 4: Attendance, Lab 5: Attendance.test.ts), and the
 * GET /events query string.
 *
 * The acting user always comes from the session. These schemas are
 * `.strict()`, so a body naming a `userId` is rejected rather than ignored.
 */
import type { CategoryKey } from "@upto/contracts";
import { z } from "zod";

export const ATTENDANCE_STATUSES = ["GOING", "INTERESTED", "NOT_GOING"] as const;
export const RSVP_SYNC_MAX = 200;
export const EVENT_ID_MAX = 191;

function bodyError(iss: { code: string; keys?: string[] }) {
  if (iss.code === "unrecognized_keys") return `unexpected field: ${iss.keys!.join(", ")}`;
  if (iss.code === "invalid_type") return "body must be an object";
  return undefined;
}

const STATUS_MESSAGE = "status must be GOING, INTERESTED or NOT_GOING";

/** Case-insensitive and trimmed: " going " is GOING. */
export const attendanceStatus = z
  .string({ error: STATUS_MESSAGE })
  .trim()
  .toUpperCase()
  .pipe(z.enum(ATTENDANCE_STATUSES, { error: STATUS_MESSAGE }));

export const rsvpSchema = z.object({ status: attendanceStatus }, { error: bodyError }).strict();

/**
 * Two deliberate choices. Lab 5 tests the behaviours but not these orderings,
 * so do not "fix" them without changing Attendance.test.ts as well:
 *
 * - The 200-id cap counts what the client SENT, before duplicates are dropped,
 *   so 201 entries are rejected even if some repeat. The cap bounds request
 *   work, and a client sending 201 entries is misbehaving whether or not they
 *   collapse. Duplicates are then dropped, keeping each id's first occurrence.
 * - An empty list is rejected (min 1). Lab 5 only says a single id passes; an
 *   empty sync would do nothing, so it is treated as a malformed request
 *   rather than a silent no-op.
 */
export const rsvpSyncSchema = z
  .object(
    {
      eventIds: z
        .array(
          z
            .string({ error: "each event id must be a string" })
            .min(1, { error: "event ids must not be empty" })
            .max(EVENT_ID_MAX, { error: `event ids must be at most ${EVENT_ID_MAX} characters` }),
          { error: "eventIds must be a list" },
        )
        .min(1, { error: `eventIds must have 1 to ${RSVP_SYNC_MAX} ids` })
        .max(RSVP_SYNC_MAX, { error: `eventIds must have 1 to ${RSVP_SYNC_MAX} ids` })
        .transform((ids) => [...new Set(ids)]),
      status: attendanceStatus,
    },
    { error: bodyError },
  )
  .strict();

export const EVENT_WINDOWS = ["now", "today", "week", "quarter", "past"] as const;
export const SHOW_ME_FILTERS = ["all", "free_food", "clubs", "active", "career"] as const;
export const CATEGORY_KEYS = [
  "food",
  "clubs",
  "trips",
  "tabling",
  "career",
  "study",
  "reslife",
  "sports",
  "volunteer",
  "speakers",
  "invite",
] as const satisfies readonly CategoryKey[];
// Fails to compile if packages/contracts adds a category this list is missing.
const _everyCategory: Record<CategoryKey, true> = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, true])) as Record<
  (typeof CATEGORY_KEYS)[number],
  true
>;
void _everyCategory;
export const EVENTS_PAGE_MAX = 100;
export const EVENTS_PAGE_DEFAULT = 50;

/**
 * GET /events query string. Every value arrives as a string; `limit` and
 * `cursor` are whole numbers written in decimal. The cursor is the offset of
 * the next page, opaque to clients, which only ever echo `nextCursor` back.
 */
export const listEventsQuerySchema = z
  .object(
    {
      when: z.enum(EVENT_WINDOWS, { error: `when must be one of ${EVENT_WINDOWS.join(", ")}` }).optional(),
      category: z.enum(CATEGORY_KEYS, { error: "category must be a known category key" }).optional(),
      filter: z.enum(SHOW_ME_FILTERS, { error: `filter must be one of ${SHOW_ME_FILTERS.join(", ")}` }).optional(),
      limit: z
        .string({ error: `limit must be a whole number from 1 to ${EVENTS_PAGE_MAX}` })
        .regex(/^\d+$/, { error: `limit must be a whole number from 1 to ${EVENTS_PAGE_MAX}` })
        .transform(Number)
        .pipe(
          z
            .number()
            .int()
            .min(1, { error: `limit must be a whole number from 1 to ${EVENTS_PAGE_MAX}` })
            .max(EVENTS_PAGE_MAX, { error: `limit must be a whole number from 1 to ${EVENTS_PAGE_MAX}` }),
        )
        .default(EVENTS_PAGE_DEFAULT),
      cursor: z
        .string({ error: "cursor must come from nextCursor" })
        .regex(/^\d{1,9}$/, { error: "cursor must come from nextCursor" })
        .transform(Number)
        .optional(),
    },
    { error: (iss) => (iss.code === "unrecognized_keys" ? `unexpected query parameter: ${iss.keys!.join(", ")}` : undefined) },
  )
  .strict();

export type RsvpInput = z.infer<typeof rsvpSchema>;
export type RsvpSyncInput = z.infer<typeof rsvpSyncSchema>;
export type ListEventsQueryInput = z.infer<typeof listEventsQuerySchema>;
