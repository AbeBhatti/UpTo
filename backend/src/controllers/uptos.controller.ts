import type { ApiResponse, ErrorCode, Poll, UpTo, UpToReport } from "@upto/contracts";
import type { UpToRow, UpTosDb } from "../services/uptos/db.js";
import { loadPoll, toPublicUser, toUpTo } from "../services/uptos/present.js";
import { reportBase, reportDetails, type ReportsDb } from "../services/uptos/reports.js";
import { DEFAULT_SHARE_BASE_URL, newShareSlug } from "../services/uptos/slug.js";
import { isUniqueClash } from "../services/verification/db.js";
import { createPollSchema, respondPollSchema } from "../validators/poll.validator.js";
import { createUpToSchema, submitReportSchema, upToRsvpSchema } from "../validators/upto.validator.js";

/**
 * Up-Tos: plans students post themselves (Lab 4: UpTo). Every function takes
 * the viewer's id (null when signed out, for the reads) and returns
 * { status, body }; the route file adapts it to Express.
 *
 * Who sees what: a published Up-To is visible to anyone, signed in or not,
 * because its share link is meant to be passed around. An unpublished one is
 * visible only to its creator; to anyone else it is 404, not 403, so its
 * existence does not leak.
 */

export interface UpTosDeps {
  db: UpTosDb & ReportsDb;
  now: () => Date;
  /** Base of UpTo.shareUrl. Defaults to https://up-to.co, as in the fixtures. */
  shareBaseUrl?: string;
  /** Overridable so tests can force a slug clash. */
  newSlug?: () => string;
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

const noUpTo = <T>() => fail<T>(404, "not_found", "Up-To not found");

/** A slug clash is retried this many times before giving up with a 500. */
const SLUG_ATTEMPTS = 5;

export function canSee(row: UpToRow, viewerId: string | null): boolean {
  return row.published || row.creatorId === viewerId;
}

const shareBase = (deps: UpTosDeps) => deps.shareBaseUrl ?? DEFAULT_SHARE_BASE_URL;

/** The Up-To this viewer may see, or null for unknown and hidden alike. */
export async function visibleUpTo(db: UpTosDb, upToId: string, viewerId: string | null): Promise<UpToRow | null> {
  const row = await db.upTo.findUnique({ where: { id: upToId } });
  return row !== null && canSee(row, viewerId) ? row : null;
}

// POST /uptos — UpTo.publish() is `publish: true`; there is no separate publish route.
export async function createUpTo(deps: UpTosDeps, userId: string, body: unknown): Promise<Reply<UpTo>> {
  const parsed = createUpToSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const now = deps.now();
  const published = input.publish === true;

  for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt++) {
    try {
      const row = await deps.db.upTo.create({
        data: {
          creatorId: userId,
          title: input.title,
          description: input.description,
          scheduledAt: new Date(input.scheduledAt),
          location: input.location,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          contact: input.contact ?? null,
          shareSlug: (deps.newSlug ?? newShareSlug)(),
          published,
          publishedAt: published ? now : null,
        },
      });
      return ok(await toUpTo(deps.db, row, userId, now, shareBase(deps)), 201);
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
    }
  }
  return fail(500, "server_error", "Could not create a share link. Try again.");
}

// GET /uptos/:id
export async function getUpTo(deps: UpTosDeps, viewerId: string | null, upToId: string): Promise<Reply<UpTo>> {
  const row = await visibleUpTo(deps.db, upToId, viewerId);
  if (row === null) return noUpTo();
  return ok(await toUpTo(deps.db, row, viewerId, deps.now(), shareBase(deps)));
}

// GET /u/:slug — the public share page. No session needed; published only,
// even for the creator, so the page shows exactly what a visitor would see.
export async function getSharedUpTo(deps: UpTosDeps, viewerId: string | null, slug: string): Promise<Reply<UpTo>> {
  const row = await deps.db.upTo.findUnique({ where: { shareSlug: slug } });
  if (row === null || !row.published) return noUpTo();
  return ok(await toUpTo(deps.db, row, viewerId, deps.now(), shareBase(deps)));
}

// POST /uptos/:id/rsvp — GOING, optionally anonymous. Repeating it updates the
// anonymity rather than adding a second RSVP.
export async function rsvpUpTo(deps: UpTosDeps, userId: string, upToId: string, body: unknown): Promise<Reply<UpTo>> {
  const parsed = upToRsvpSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const row = await visibleUpTo(deps.db, upToId, userId);
  if (row === null) return noUpTo();

  const anonymous = parsed.data.anonymous ?? false;
  await deps.db.upToRsvp.upsert({
    where: { upToId_userId: { upToId, userId } },
    create: { upToId, userId, anonymous },
    update: { anonymous },
  });
  return ok(await toUpTo(deps.db, row, userId, deps.now(), shareBase(deps)));
}

// POST /uptos/:id/poll — the creator adds the one poll an Up-To may have.
// Slots keep the order given; a slot with no `order` takes its list position.
export async function createPoll(deps: UpTosDeps, userId: string, upToId: string, body: unknown): Promise<Reply<Poll>> {
  const parsed = createPollSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const row = await visibleUpTo(deps.db, upToId, userId);
  if (row === null) return noUpTo();
  if (row.creatorId !== userId) return fail(403, "forbidden", "Only the person who posted this Up-To can add a poll.");

  const already = () => fail<Poll>(400, "invalid_request", "This Up-To already has a poll.");
  if ((await deps.db.poll.findUnique({ where: { upToId } })) !== null) return already();

  try {
    await deps.db.$transaction(async (tx) => {
      const poll = await tx.poll.create({ data: { upToId, question: parsed.data.question } });
      for (const [index, slot] of parsed.data.slots.entries()) {
        await tx.pollSlot.create({ data: { pollId: poll.id, label: slot.label, order: slot.order ?? index } });
      }
    });
  } catch (error) {
    // Two creates racing: Poll.upToId is unique, so the loser lands here.
    if (isUniqueClash(error)) return already();
    throw error;
  }
  return ok((await loadPoll(deps.db, upToId, userId))!, 201);
}

// POST /uptos/:id/poll/respond — the caller's availability per slot. Each
// answer replaces the caller's previous one for that slot.
export async function respondPoll(deps: UpTosDeps, userId: string, upToId: string, body: unknown): Promise<Reply<Poll>> {
  const parsed = respondPollSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const row = await visibleUpTo(deps.db, upToId, userId);
  if (row === null) return noUpTo();
  const poll = await deps.db.poll.findUnique({ where: { upToId } });
  if (poll === null) return fail(404, "not_found", "This Up-To has no poll.");

  const slotIds = new Set((await deps.db.pollSlot.findMany({ where: { pollId: poll.id } })).map((slot) => slot.id));
  const stranger = parsed.data.responses.find((response) => !slotIds.has(response.slotId));
  if (stranger) return fail(400, "invalid_request", `slot ${stranger.slotId} is not in this poll`, "responses");

  await deps.db.$transaction(async (tx) => {
    for (const { slotId, available } of parsed.data.responses) {
      await tx.pollResponse.upsert({
        where: { slotId_userId: { slotId, userId } },
        create: { slotId, userId, available },
        update: { available },
      });
    }
  });
  return ok((await loadPoll(deps.db, upToId, userId))!);
}

// POST /uptos/:id/report — narrowed into the class diagram's UpToReport.
export async function reportUpTo(deps: UpTosDeps, userId: string, upToId: string, body: unknown): Promise<Reply<UpToReport>> {
  const parsed = submitReportSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  // Only what the reporter can see can be reported; a hidden draft stays 404.
  const row = await visibleUpTo(deps.db, upToId, userId);
  if (row === null) return noUpTo();
  const reporter = await deps.db.user.findUnique({ where: { id: userId } });
  if (reporter === null) return fail(401, "unauthorized", "Sign in first.");

  const report = await deps.db.report.create({
    data: {
      reporterId: userId,
      targetType: "UPTO",
      reason: parsed.data.reason,
      details: reportDetails(parsed.data.details),
      upToId,
      dropId: null,
      messageId: null,
    },
  });
  const upTo = await toUpTo(deps.db, row, userId, deps.now(), shareBase(deps));
  return ok({ ...reportBase(report, toPublicUser(reporter)), targetType: "UPTO", upTo }, 201);
}
