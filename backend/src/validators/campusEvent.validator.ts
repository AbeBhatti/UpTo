/**
 * The GET /events query string: Home's sections, Discover's WHEN and SHOW ME
 * rails, and paging. Kept apart from campusEventRsvp.validator.ts, which Lab 5
 * names as the Attendance validator.
 *
 * Every object schema is `.strict()`, as in the Lab 5 validators.
 */
import type { CategoryKey } from "@upto/contracts";
import { z } from "zod";

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

export type ListEventsQueryInput = z.infer<typeof listEventsQuerySchema>;
