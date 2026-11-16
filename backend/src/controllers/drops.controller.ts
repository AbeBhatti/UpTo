import type { ApiResponse, Drop as DropDto, ErrorCode } from "@upto/contracts";
import type { DropsDb } from "../services/drops/db.js";
import { DROP_LIFETIME_MS, Drop, toDrop } from "../services/drops/drops.js";
import { isUniqueClash } from "../services/verification/db.js";
import { DROPS_RULES_VERSION, createDropSchema, rulesAgreementSchema, voteDropSchema } from "../validators/drops.validator.js";

/**
 * Drops: quick map pins (Lab 4: Drop). Every function takes the viewer's id
 * (null when signed out, for the read) and returns { status, body }; the
 * route file adapts it to Express.
 *
 * Text, category, coordinates and clientRef are fully checked by
 * drops.validator.ts, which also normalises the text; this file stores what
 * the validator returns and never re-measures it.
 */

export interface DropsDeps {
  db: DropsDb;
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

const noDrop = <T>() => fail<T>(404, "not_found", "Drop not found");

// GET /drops — active drops only, newest first.
export async function listDrops(deps: DropsDeps, viewerId: string | null): Promise<Reply<DropDto[]>> {
  const now = deps.now();
  const rows = await deps.db.drop.findMany({ where: Drop.activeWhere(now), orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return ok(await Promise.all(rows.map((row) => toDrop(deps.db, row, viewerId, now))));
}

// POST /drops/rules-agreement — the poster has read the current rules.
export async function agreeToRules(deps: DropsDeps, userId: string, body: unknown): Promise<Reply<{ rulesVersion: number }>> {
  const parsed = rulesAgreementSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { rulesVersion } = parsed.data;
  const agreedAt = deps.now();
  await deps.db.dropRulesAgreement.upsert({
    where: { userId },
    create: { userId, rulesVersion, agreedAt },
    update: { rulesVersion, agreedAt },
  });
  return ok({ rulesVersion });
}

/**
 * POST /drops. Posting needs an agreement to the CURRENT rules version;
 * anything older is 409 rules_outdated, the contract's code for exactly this.
 *
 * Idempotent on clientRef: replaying a create with the same clientRef returns
 * the drop it already made (200, not 201) instead of a second pin, which is
 * what a retry after a dropped connection needs. The replayed body is not
 * compared with the first; the first create wins.
 */
export async function createDrop(deps: DropsDeps, userId: string, body: unknown): Promise<Reply<DropDto>> {
  const parsed = createDropSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const now = deps.now();

  const agreement = await deps.db.dropRulesAgreement.findUnique({ where: { userId } });
  if (agreement === null || agreement.rulesVersion < DROPS_RULES_VERSION) {
    return fail(409, "rules_outdated", `Agree to the drop rules (version ${DROPS_RULES_VERSION}) before posting.`);
  }

  const replay = async () => {
    if (input.clientRef === undefined) return null;
    const existing = await deps.db.drop.findUnique({ where: { authorId_clientRef: { authorId: userId, clientRef: input.clientRef } } });
    return existing === null ? null : ok(await toDrop(deps.db, existing, userId, now));
  };

  const earlier = await replay();
  if (earlier) return earlier;

  try {
    const row = await deps.db.drop.create({
      data: {
        authorId: userId,
        category: input.category,
        text: input.text,
        lat: input.lat,
        lng: input.lng,
        expiresAt: new Date(now.getTime() + DROP_LIFETIME_MS),
        clientRef: input.clientRef ?? null,
      },
    });
    return ok(await toDrop(deps.db, row, userId, now), 201);
  } catch (error) {
    // Two replays racing: (authorId, clientRef) is unique, so the loser returns the winner's drop.
    if (isUniqueClash(error)) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw error;
  }
}

// POST /drops/:id/vote — HERE or GONE; null withdraws the vote by deleting the row.
export async function voteDrop(deps: DropsDeps, userId: string, dropId: string, body: unknown): Promise<Reply<DropDto>> {
  const parsed = voteDropSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const now = deps.now();

  const drop = await deps.db.drop.findUnique({ where: { id: dropId } });
  if (drop === null) return noDrop();
  if (!Drop.isActive(drop, now)) return fail(410, "expired", "This drop has expired.");

  const { vote } = parsed.data;
  if (vote === null) {
    await deps.db.dropVote.deleteMany({ where: { dropId, userId } });
  } else {
    await deps.db.dropVote.upsert({
      where: { dropId_userId: { dropId, userId } },
      create: { dropId, userId, kind: vote },
      update: { kind: vote },
    });
  }
  return ok(await toDrop(deps.db, drop, userId, now));
}
