import type { ApiResponse, CampusEvent, ErrorCode, ListEventsResponse, RsvpSyncResponse } from "@upto/contracts";
import { Attendance } from "../services/events/attendance.js";
import { eventInclude, type EventsDb } from "../services/events/db.js";
import { toCampusEvent } from "../services/events/present.js";
import { SHOW_ME, windowOrder, windowWhere } from "../services/events/windows.js";
import { listEventsQuerySchema } from "../validators/campusEvent.validator.js";
import { rsvpSchema, rsvpSyncSchema } from "../validators/campusEventRsvp.validator.js";

/**
 * Campus events: the feed, one event, and RSVPs. Every function takes the
 * viewer's id (null when signed out, for the two reads) and returns
 * { status, body }; the route file adapts it to Express.
 *
 * Only APPROVED events are ever shown to students. PENDING and REJECTED
 * events answer 404, not 403, so their existence does not leak; an admin can
 * open one by id, and reviews the queue through the admin routes.
 */

export interface EventsDeps {
  db: EventsDb;
  now: () => Date;
}

export interface Reply<T> {
  status: number;
  body: ApiResponse<T>;
}

function fail<T>(status: number, code: ErrorCode, message: string, field?: string): Reply<T> {
  return { status, body: { ok: false, error: field ? { code, message, field } : { code, message } } };
}

function invalid<T>(error: { issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }> }): Reply<T> {
  const issue = error.issues[0];
  const field = issue?.path[0];
  return fail(400, "invalid_request", issue?.message ?? "Invalid request", typeof field === "string" ? field : undefined);
}

const ok = <T>(data: T, status = 200): Reply<T> => ({ status, body: { ok: true, data } });

const noEvent = <T>() => fail<T>(404, "not_found", "Event not found");

const APPROVED = { reviewStatus: "APPROVED" } as const;

async function isAdmin(db: EventsDb, viewerId: string | null): Promise<boolean> {
  if (viewerId === null) return false;
  return (await db.user.findUnique({ where: { id: viewerId } }))?.isAdmin === true;
}

// GET /events
export async function listEvents(
  deps: EventsDeps,
  viewerId: string | null,
  query: unknown,
): Promise<Reply<ListEventsResponse>> {
  const parsed = listEventsQuerySchema.safeParse(query ?? {});
  if (!parsed.success) return invalid(parsed.error);
  const { when, category, filter, limit, cursor = 0 } = parsed.data;

  const now = deps.now();
  const scope = { AND: [APPROVED, windowWhere(when, now), category ? { category } : {}] };
  const shown = filter && SHOW_ME[filter] ? { AND: [scope, { category: SHOW_ME[filter] }] } : scope;

  // One extra row says whether there is a next page without a second count.
  const rows = await deps.db.campusEvent.findMany({
    where: shown,
    include: eventInclude(viewerId),
    orderBy: windowOrder(when),
    skip: cursor,
    take: limit + 1,
  });

  // The SHOW ME counts ignore `filter` itself, so every chip shows its own total.
  const counts: Record<string, number> = {};
  for (const [key, showMe] of Object.entries(SHOW_ME)) {
    counts[key] = await deps.db.campusEvent.count({ where: showMe ? { AND: [scope, { category: showMe }] } : scope });
  }

  return ok({
    events: rows.slice(0, limit).map((row) => toCampusEvent(row, now)),
    counts,
    nextCursor: rows.length > limit ? String(cursor + limit) : null,
  });
}

// GET /events/:id
export async function getEvent(deps: EventsDeps, viewerId: string | null, eventId: string): Promise<Reply<CampusEvent>> {
  const event = await deps.db.campusEvent.findUnique({ where: { id: eventId }, include: eventInclude(viewerId) });
  if (event === null) return noEvent();
  if (event.reviewStatus !== "APPROVED" && !(await isAdmin(deps.db, viewerId))) return noEvent();
  return ok(toCampusEvent(event, deps.now()));
}

// POST /events/:id/rsvp — returns the event as this viewer now sees it.
export async function rsvp(deps: EventsDeps, userId: string, eventId: string, body: unknown): Promise<Reply<CampusEvent>> {
  const parsed = rsvpSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const event = await deps.db.campusEvent.findUnique({ where: { id: eventId }, include: eventInclude(userId) });
  if (event === null || event.reviewStatus !== "APPROVED") return noEvent();

  await Attendance.setStatus(deps.db, userId, eventId, parsed.data.status);
  const updated = await deps.db.campusEvent.findUnique({ where: { id: eventId }, include: eventInclude(userId) });
  if (updated === null) return noEvent();
  return ok(toCampusEvent(updated, deps.now()));
}

// POST /events/rsvp/sync — replays an offline queue. Ids that are unknown or
// not approved are skipped, not an error, so one stale id cannot sink the batch.
export async function rsvpSync(deps: EventsDeps, userId: string, body: unknown): Promise<Reply<RsvpSyncResponse>> {
  const parsed = rsvpSyncSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { eventIds, status } = parsed.data;

  const found = await deps.db.campusEvent.findMany({
    where: { AND: [APPROVED, { id: { in: eventIds } }] },
    select: { id: true },
  });
  const known = new Set(found.map((event) => event.id));

  let updated = 0;
  const skipped: string[] = [];
  for (const eventId of eventIds) {
    if (!known.has(eventId)) {
      skipped.push(eventId);
      continue;
    }
    await Attendance.setStatus(deps.db, userId, eventId, status);
    updated += 1;
  }
  return ok({ updated, skipped });
}
