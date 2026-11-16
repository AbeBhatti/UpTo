/**
 * Development seed: makes Home and Discover look like the screenshots.
 *
 * It imports fixtures/events.ts rather than copying it, so the database and
 * the fixtures Home was built against cannot drift apart. It writes:
 *
 *   - the 12 fixture events: 3 Right Now, 2 Later today, 6 This week, and the
 *     PENDING potluck for the admin queue, with their two sources
 *   - the four fixture people; Abhi is a verified student, Edrick is the admin
 *   - two drops (one live, one expired) with their votes
 *   - the CSEN 174 study session Up-To, with its three-slot poll
 *   - the CSEN 174 Team chat room, with Abhi two messages behind
 *
 * Every denormalised count is BACKED BY REAL ROWS. goingCount is recomputed
 * from Attendance on every RSVP, so seeding "31 going" over one row would
 * collapse to 1 the first time anyone tapped. A pool of placeholder students
 * (seed01..seed30) supplies the attendances, votes and poll answers behind
 * the fixture numbers.
 *
 * Idempotent: every row is upserted on a stable id or unique key, so running
 * it twice changes nothing.
 *
 * Times: by default every timestamp is the fixture's own, which is what the
 * screenshots show at the fixture's NOW (Sun 15 Nov 2026, 1:00 p.m. PT). Set
 * SEED_SHIFT=now to move everything by (now - NOW) so the same sections are
 * populated whenever you run it; clock times then shift with it.
 *
 * Passwords: set SEED_PASSWORD to give Abhi, Edrick, Liz and Abe a password you
 * can sign in with. Without it they are created with no password.
 *
 *   DATABASE_URL=... SEED_PASSWORD=... npx tsx prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { ADMIN, DROPS, EVENTS, ME, NOW, PEOPLE, ROOMS, UPTOS } from "@upto/fixtures";
import { hashSecret } from "../src/services/verification/hashing.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed with NODE_ENV=production.");
  process.exit(1);
}

const prisma = new PrismaClient();

const SHIFT_MS = process.env.SEED_SHIFT === "now" ? Date.now() - Date.parse(NOW) : 0;
const at = (iso: string) => new Date(Date.parse(iso) + SHIFT_MS);
const atOrNull = (iso: string | null) => (iso === null ? null : at(iso));
const MINUTE = 60 * 1000;

/** Feed URLs for the two sources. The fixtures carry only id, type and label. */
const SOURCE_URLS: Record<string, string> = {
  src_livewhale: "https://www.scu.edu/events/",
  src_flyer: "upload://flyer",
};

const POOL_SIZE = 30;
const pool = Array.from({ length: POOL_SIZE }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { id: `usr_seed${n}`, username: `seed${n}`, name: `Seed Student ${n}` };
});

async function seedUsers(): Promise<void> {
  const passwordHash = process.env.SEED_PASSWORD ? await hashSecret(process.env.SEED_PASSWORD) : null;
  const named = PEOPLE.map((person) => {
    const me = person.id === ME.id ? ME : person.id === ADMIN.id ? ADMIN : null;
    return {
      id: person.id,
      username: person.username,
      name: person.name,
      avatarSeed: person.avatarSeed,
      avatarUrl: person.avatarUrl,
      // ADMIN spreads ME in the fixtures, so it inherits ME's email; email is
      // unique, so only Abhi keeps it.
      email: person.id === ME.id ? ME.email : null,
      passwordHash,
      isVerifiedStudent: me?.isVerifiedStudent ?? false,
      campusEmail: me?.campusEmail ?? null,
      campusVerifiedAt: me?.isVerifiedStudent ? at(NOW) : null,
      classOf: me?.classOf ?? null,
      isAdmin: me?.isAdmin ?? false,
    };
  });
  for (const user of [...named, ...pool]) {
    await prisma.user.upsert({ where: { id: user.id }, create: user, update: user });
  }
}

async function seedEvents(): Promise<void> {
  for (const event of EVENTS) {
    if (event.source) {
      const source = {
        id: event.source.id,
        type: event.source.type as "LIVEWHALE" | "FLYER" | "MANUAL",
        url: SOURCE_URLS[event.source.id] ?? "about:blank",
        label: event.source.label,
      };
      await prisma.eventSource.upsert({ where: { id: source.id }, create: source, update: source });
    }

    const row = {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: at(event.startsAt),
      endsAt: atOrNull(event.endsAt),
      location: event.location,
      lat: event.lat,
      lng: event.lng,
      organizer: event.organizer,
      category: event.category,
      goingCount: event.goingCount,
      reviewStatus: event.reviewStatus,
      signupUrl: event.signup.url,
      signupOpensAt: atOrNull(event.signup.opensAt),
      signupClosesAt: atOrNull(event.signup.closesAt),
      sourceId: event.source?.id ?? null,
    };
    await prisma.campusEvent.upsert({ where: { id: event.id }, create: row, update: row });

    // Abhi's own RSVP, then placeholder students up to the fixture's goingCount.
    const goers = event.myStatus === "GOING" ? [ME.id] : [];
    const needed = event.goingCount - goers.length;
    if (needed > POOL_SIZE) throw new Error(`${event.id} needs ${needed} placeholder students; raise POOL_SIZE`);
    goers.push(...pool.slice(0, needed).map((user) => user.id));
    if (event.myStatus && event.myStatus !== "GOING") {
      await attend(ME.id, event.id, event.myStatus);
    }
    for (const userId of goers) await attend(userId, event.id, "GOING");
  }
}

async function attend(userId: string, campusEventId: string, status: "GOING" | "INTERESTED" | "NOT_GOING") {
  await prisma.attendance.upsert({
    where: { userId_campusEventId: { userId, campusEventId } },
    create: { userId, campusEventId, status },
    update: { status },
  });
}

async function seedDrops(): Promise<void> {
  for (const drop of DROPS) {
    const row = {
      id: drop.id,
      authorId: drop.author.id,
      category: drop.category,
      text: drop.text,
      lat: drop.lat,
      lng: drop.lng,
      expiresAt: at(drop.expiresAt),
      // The fixtures carry no creation time; an hour before expiry keeps the order sensible.
      createdAt: new Date(at(drop.expiresAt).getTime() - 60 * MINUTE),
    };
    await prisma.drop.upsert({ where: { id: drop.id }, create: row, update: row });

    // Abhi's vote first, then placeholder students for the remaining HERE and GONE counts.
    const votes: Array<{ userId: string; kind: "HERE" | "GONE" }> = [];
    if (drop.myVote) votes.push({ userId: ME.id, kind: drop.myVote });
    const voters = pool.filter((user) => user.id !== drop.author.id).map((user) => user.id);
    const remaining = (kind: "HERE" | "GONE", total: number) => total - votes.filter((vote) => vote.kind === kind).length;
    const here = remaining("HERE", drop.hereCount);
    const gone = remaining("GONE", drop.goneCount);
    voters.slice(0, here).forEach((userId) => votes.push({ userId, kind: "HERE" }));
    voters.slice(here, here + gone).forEach((userId) => votes.push({ userId, kind: "GONE" }));

    for (const vote of votes) {
      await prisma.dropVote.upsert({
        where: { dropId_userId: { dropId: drop.id, userId: vote.userId } },
        create: { dropId: drop.id, ...vote },
        update: { kind: vote.kind },
      });
    }
  }
}

async function seedUpTos(): Promise<void> {
  for (const upTo of UPTOS) {
    const row = {
      id: upTo.id,
      creatorId: upTo.creator.id,
      title: upTo.title,
      description: upTo.description,
      scheduledAt: at(upTo.scheduledAt),
      location: upTo.location,
      lat: upTo.lat,
      lng: upTo.lng,
      shareSlug: upTo.shareSlug,
      published: upTo.published,
      publishedAt: upTo.published ? at(NOW) : null,
    };
    await prisma.upTo.upsert({ where: { id: upTo.id }, create: row, update: row });

    for (const user of pool.slice(0, upTo.goingCount)) {
      await prisma.upToRsvp.upsert({
        where: { upToId_userId: { upToId: upTo.id, userId: user.id } },
        create: { upToId: upTo.id, userId: user.id, anonymous: false },
        update: {},
      });
    }

    if (upTo.poll) {
      const poll = { id: upTo.poll.id, upToId: upTo.id, question: upTo.poll.question };
      await prisma.poll.upsert({ where: { id: poll.id }, create: poll, update: poll });
      for (const slot of upTo.poll.slots) {
        const slotRow = { id: slot.id, pollId: poll.id, label: slot.label, order: slot.order };
        await prisma.pollSlot.upsert({ where: { id: slot.id }, create: slotRow, update: slotRow });
        for (const user of pool.slice(0, slot.availableCount)) {
          await prisma.pollResponse.upsert({
            where: { slotId_userId: { slotId: slot.id, userId: user.id } },
            create: { slotId: slot.id, userId: user.id, available: true },
            update: { available: true },
          });
        }
      }
    }
  }
}

async function seedRooms(): Promise<void> {
  for (const room of ROOMS) {
    const row = { id: room.id, type: room.type, name: room.name };
    await prisma.room.upsert({ where: { id: room.id }, create: row, update: row });

    const last = room.lastMessage;
    const lastAt = last ? at(last.createdAt) : at(NOW);
    // Abhi read the room just before the unread messages arrived.
    const readAt = new Date(lastAt.getTime() - (room.unreadCount + 1) * MINUTE);

    for (const member of room.members) {
      const lastReadAt = member.id === ME.id ? readAt : lastAt;
      await prisma.roomMember.upsert({
        where: { roomId_userId: { roomId: room.id, userId: member.id } },
        create: { roomId: room.id, userId: member.id, lastReadAt },
        update: { lastReadAt },
      });
    }

    // One message Abhi has read, then unreadCount messages from others ending
    // with the fixture's lastMessage.
    const others = room.members.filter((member) => member.id !== ME.id && member.id !== last?.sender.id);
    const messages = [
      { id: `${room.id}_read`, senderId: ME.id, content: "Seeded earlier message.", createdAt: new Date(readAt.getTime() - MINUTE) },
      ...Array.from({ length: Math.max(room.unreadCount - 1, 0) }, (_, i) => ({
        id: `${room.id}_unread_${i + 1}`,
        senderId: others[i % others.length]!.id,
        content: "Seeded unread message.",
        createdAt: new Date(readAt.getTime() + (i + 1) * (MINUTE / 2)),
      })),
      ...(last ? [{ id: last.id, senderId: last.sender.id, content: last.content, createdAt: lastAt }] : []),
    ];
    for (const message of messages) {
      const data = { ...message, roomId: room.id };
      await prisma.message.upsert({ where: { id: message.id }, create: data, update: data });
    }
  }
}

async function main(): Promise<void> {
  await seedUsers();
  await seedEvents();
  await seedDrops();
  await seedUpTos();
  await seedRooms();
  const shifted = SHIFT_MS === 0 ? "at the fixture's times" : `shifted by ${Math.round(SHIFT_MS / MINUTE)} minutes`;
  console.log(`Seeded ${EVENTS.length} events, ${DROPS.length} drops, ${UPTOS.length} Up-To, ${ROOMS.length} room, ${PEOPLE.length + POOL_SIZE} users, ${shifted}.`);
  if (!process.env.SEED_PASSWORD) console.log("SEED_PASSWORD was not set: seeded accounts have no password.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
