import type { Poll, PublicUser, UpTo } from "@upto/contracts";
import type { UserRow } from "../verification/db.js";
import { timeLabel } from "../events/computed.js";
import type { UpToRow, UpTosDb } from "./db.js";
import { shareUrlFor } from "./slug.js";

/**
 * Presents an Up-To exactly as packages/contracts declares it, for one viewer
 * at one instant. A signed-out viewer (null) gets myRsvp and every
 * myResponse as null.
 *
 * What a viewer can learn about who is going: only goingCount, which counts
 * anonymous RSVPs too, and their own myRsvp. The contract has no attendee
 * list, so an anonymous RSVP never exposes its user.
 *
 * Not returned: `contact`. The column exists, but packages/contracts' UpTo has
 * no contact field yet, and the backend returns exactly the contract.
 */

export function toPublicUser(user: Pick<UserRow, "id" | "username" | "name" | "avatarSeed" | "avatarUrl">): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarSeed: user.avatarSeed,
    avatarUrl: user.avatarUrl,
  };
}

/** The Up-To's poll with per-slot counts, or null if it has none. */
export async function loadPoll(db: UpTosDb, upToId: string, viewerId: string | null): Promise<Poll | null> {
  const poll = await db.poll.findUnique({ where: { upToId } });
  if (poll === null) return null;
  const slots = await db.pollSlot.findMany({ where: { pollId: poll.id }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  return {
    id: poll.id,
    question: poll.question,
    slots: await Promise.all(
      slots.map(async (slot) => {
        const [mine, availableCount] = await Promise.all([
          viewerId === null ? null : db.pollResponse.findUnique({ where: { slotId_userId: { slotId: slot.id, userId: viewerId } } }),
          db.pollResponse.count({ where: { slotId: slot.id, available: true } }),
        ]);
        return {
          id: slot.id,
          label: slot.label,
          order: slot.order,
          availableCount,
          myResponse: mine === null ? null : mine.available,
        };
      }),
    ),
  };
}

export async function toUpTo(db: UpTosDb, row: UpToRow, viewerId: string | null, now: Date, shareBaseUrl: string): Promise<UpTo> {
  // Independent reads, run together: against Postgres each is a round trip.
  const [creator, mine, goingCount, poll] = await Promise.all([
    db.user.findUnique({ where: { id: row.creatorId } }),
    viewerId === null ? null : db.upToRsvp.findUnique({ where: { upToId_userId: { upToId: row.id, userId: viewerId } } }),
    db.upToRsvp.count({ where: { upToId: row.id } }),
    loadPoll(db, row.id, viewerId),
  ]);
  if (creator === null) throw new Error(`Up-To ${row.id} has no creator ${row.creatorId}`);

  return {
    id: row.id,
    creator: toPublicUser(creator),
    title: row.title,
    description: row.description,
    scheduledAt: row.scheduledAt.toISOString(),
    location: row.location,
    lat: row.lat,
    lng: row.lng,
    shareSlug: row.shareSlug,
    shareUrl: shareUrlFor(shareBaseUrl, row.shareSlug),
    published: row.published,
    goingCount,
    myRsvp: mine === null ? null : { going: true, anonymous: mine.anonymous },
    poll,
    // An Up-To has one time and no end, so it reads like an event with no end time.
    timeLabel: timeLabel({ startsAt: row.scheduledAt, endsAt: null }, now),
  };
}
