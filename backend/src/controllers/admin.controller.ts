import type { ApiResponse, CampusEvent as CampusEventDto, ErrorCode, PendingEventsResponse, Report } from "@upto/contracts";
import type { DropsDb } from "../services/drops/db.js";
import { toDrop } from "../services/drops/drops.js";
import { CampusEvent } from "../services/events/campusEvent.js";
import { eventInclude, type EventsDb } from "../services/events/db.js";
import { toCampusEvent } from "../services/events/present.js";
import type { UpTosDb } from "../services/uptos/db.js";
import { toPublicUser, toUpTo } from "../services/uptos/present.js";
import { reportBase, type ReportsReadDb } from "../services/uptos/reports.js";
import { DEFAULT_SHARE_BASE_URL } from "../services/uptos/slug.js";

/**
 * The admin console's API: the review queue for imported and flyer events,
 * and the reports queue. Every function assumes the caller is an admin; the
 * route file checks that first (401 signed out, 403 not an admin).
 *
 * POST /admin/flyer is not here: Gemini flyer reading is cut this week, so it
 * stays a 501 stub.
 */

/** One database in production. Events, Up-Tos, drops and reports all read through it. */
export type AdminDb = EventsDb & UpTosDb & DropsDb & ReportsReadDb;

export interface AdminDeps {
  db: AdminDb;
  now: () => Date;
  /** Base of UpTo.shareUrl in reported Up-Tos. Defaults to https://up-to.co. */
  shareBaseUrl?: string;
}

export interface Reply<T> {
  status: number;
  body: ApiResponse<T>;
}

function fail<T>(status: number, code: ErrorCode, message: string): Reply<T> {
  return { status, body: { ok: false, error: { code, message } } };
}

const ok = <T>(data: T, status = 200): Reply<T> => ({ status, body: { ok: true, data } });

/** Is this signed-in user an admin? */
export async function isAdmin(db: AdminDb, userId: string): Promise<boolean> {
  return (await db.user.findUnique({ where: { id: userId } }))?.isAdmin === true;
}

// GET /admin/events/pending — soonest first, so what is about to happen is reviewed first.
export async function pendingEvents(deps: AdminDeps, adminId: string): Promise<Reply<PendingEventsResponse>> {
  const where = { reviewStatus: "PENDING" };
  const rows = await deps.db.campusEvent.findMany({
    where,
    include: eventInclude(adminId),
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  const now = deps.now();
  return ok({ events: rows.map((row) => toCampusEvent(row, now)), total: await deps.db.campusEvent.count({ where }) });
}

async function reviewed(
  deps: AdminDeps,
  adminId: string,
  eventId: string,
  move: (db: EventsDb, id: string) => Promise<unknown>,
): Promise<Reply<CampusEventDto>> {
  const exists = await deps.db.campusEvent.findUnique({ where: { id: eventId }, include: eventInclude(adminId) });
  if (exists === null) return fail(404, "not_found", "Event not found");
  await move(deps.db, eventId);
  const updated = await deps.db.campusEvent.findUnique({ where: { id: eventId }, include: eventInclude(adminId) });
  return ok(toCampusEvent(updated!, deps.now()));
}

// POST /admin/events/:id/approve — CampusEvent.approve()
export function approveEvent(deps: AdminDeps, adminId: string, eventId: string): Promise<Reply<CampusEventDto>> {
  return reviewed(deps, adminId, eventId, CampusEvent.approve);
}

// POST /admin/events/:id/reject
export function rejectEvent(deps: AdminDeps, adminId: string, eventId: string): Promise<Reply<CampusEventDto>> {
  return reviewed(deps, adminId, eventId, CampusEvent.reject);
}

/**
 * GET /admin/reports — drop and Up-To reports, newest first, each narrowed
 * into its subclass with the reported target as the admin sees it.
 *
 * MESSAGE reports share the table but are not listed: presenting a Message
 * belongs to Abe's chat code, and this brief covers the two kinds the class
 * diagram names. Adding them is one more branch here once chat exports a
 * message presenter.
 */
export async function listReports(deps: AdminDeps, adminId: string): Promise<Reply<Report[]>> {
  const rows = await deps.db.report.findMany({
    where: { targetType: { in: ["DROP", "UPTO"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const now = deps.now();
  const reports: Report[] = [];
  for (const row of rows) {
    const reporter = await deps.db.user.findUnique({ where: { id: row.reporterId } });
    if (reporter === null) continue;
    const base = reportBase(row, toPublicUser(reporter));
    if (row.targetType === "DROP" && row.dropId) {
      const drop = await deps.db.drop.findUnique({ where: { id: row.dropId } });
      if (drop) reports.push({ ...base, targetType: "DROP", drop: await toDrop(deps.db, drop, adminId, now) });
    } else if (row.targetType === "UPTO" && row.upToId) {
      const upTo = await deps.db.upTo.findUnique({ where: { id: row.upToId } });
      const shareBase = deps.shareBaseUrl ?? DEFAULT_SHARE_BASE_URL;
      if (upTo) reports.push({ ...base, targetType: "UPTO", upTo: await toUpTo(deps.db, upTo, adminId, now, shareBase) });
    }
  }
  return ok(reports);
}
