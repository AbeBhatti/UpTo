import type { Drop as DropDto } from "@upto/contracts";
import { toPublicUser } from "../uptos/present.js";
import type { DropRow, DropsDb } from "./db.js";

/**
 * Lab 4: Drop, with isActive(). A drop is a short-lived map pin, so it is
 * active until its server-set expiresAt and simply disappears from GET /drops
 * after that.
 */

/**
 * Deliberate: a drop lives 2 hours from when it is posted. No lab or contract
 * states a lifetime; free food and pop-ups are gone within an hour or two, and
 * the fixtures' live drop (posted before 1:00 p.m., expiring 2:30 p.m.) fits.
 * The client never sends expiresAt: the create schema is `.strict()`.
 */
export const DROP_LIFETIME_MS = 2 * 60 * 60 * 1000;

export const Drop = {
  /** Lab 4: Drop.isActive() is expiresAt > now. */
  isActive(drop: Pick<DropRow, "expiresAt">, now: Date): boolean {
    return drop.expiresAt.getTime() > now.getTime();
  },

  /** The same rule as a where-clause, for GET /drops. */
  activeWhere(now: Date) {
    return { expiresAt: { gt: now } };
  },
};

/** Presents a drop exactly as packages/contracts declares it, for one viewer at one instant. */
export async function toDrop(db: DropsDb, row: DropRow, viewerId: string | null, now: Date): Promise<DropDto> {
  // Independent reads, run together: against Postgres each is a round trip.
  const [author, mine, hereCount, goneCount] = await Promise.all([
    db.user.findUnique({ where: { id: row.authorId } }),
    viewerId === null ? null : db.dropVote.findUnique({ where: { dropId_userId: { dropId: row.id, userId: viewerId } } }),
    db.dropVote.count({ where: { dropId: row.id, kind: "HERE" } }),
    db.dropVote.count({ where: { dropId: row.id, kind: "GONE" } }),
  ]);
  if (author === null) throw new Error(`Drop ${row.id} has no author ${row.authorId}`);
  return {
    id: row.id,
    author: toPublicUser(author),
    category: row.category,
    text: row.text,
    lat: row.lat,
    lng: row.lng,
    expiresAt: row.expiresAt.toISOString(),
    isActive: Drop.isActive(row, now),
    hereCount,
    goneCount,
    myVote: mine === null ? null : mine.kind,
  };
}
