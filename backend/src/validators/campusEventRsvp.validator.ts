/**
 * Campus event RSVPs (Lab 4: Attendance, Lab 5: Attendance.test.ts).
 *
 * The acting user always comes from the session. These schemas are
 * `.strict()`, so a body naming a `userId` is rejected rather than ignored.
 */
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

export type RsvpInput = z.infer<typeof rsvpSchema>;
export type RsvpSyncInput = z.infer<typeof rsvpSyncSchema>;
