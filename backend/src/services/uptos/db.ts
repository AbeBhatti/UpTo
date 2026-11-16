import type { UserRow } from "../verification/db.js";

/**
 * The slice of the database Up-Tos and their polls touch, with Prisma's method
 * shapes so the real PrismaClient (via a cast at the composition root, as for
 * events) and the in-memory ContentFakeDb both fit. Rows mirror
 * prisma/schema.prisma: UpTo, UpToRsvp, Poll, PollSlot, PollResponse.
 *
 * No query here uses `include`. Related rows are read with their own query,
 * which keeps the fake free of relation loading.
 */

export interface UpToRow {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  scheduledAt: Date;
  location: string;
  lat: number | null;
  lng: number | null;
  shareSlug: string;
  contact: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpToRsvpRow {
  id: string;
  upToId: string;
  userId: string;
  anonymous: boolean;
  createdAt: Date;
}

export interface PollRow {
  id: string;
  upToId: string;
  question: string;
  createdAt: Date;
}

export interface PollSlotRow {
  id: string;
  pollId: string;
  label: string;
  order: number;
}

export interface PollResponseRow {
  id: string;
  slotId: string;
  userId: string;
  available: boolean;
  createdAt: Date;
}

type Filter = Record<string, unknown>;
type Order = Record<string, "asc" | "desc">;

interface Table<RowT, CreateT> {
  findUnique(args: { where: Filter }): Promise<RowT | null>;
  findFirst(args: { where: Filter; orderBy?: Order | Order[] }): Promise<RowT | null>;
  findMany(args: { where: Filter; orderBy?: Order | Order[]; take?: number }): Promise<RowT[]>;
  count(args: { where: Filter }): Promise<number>;
  create(args: { data: CreateT }): Promise<RowT>;
}

export interface UpTosDb {
  user: { findUnique(args: { where: { id: string } }): Promise<UserRow | null> };
  upTo: Table<
    UpToRow,
    {
      creatorId: string;
      title: string;
      description: string | null;
      scheduledAt: Date;
      location: string;
      lat: number | null;
      lng: number | null;
      contact: string | null;
      shareSlug: string;
      published: boolean;
      publishedAt: Date | null;
    }
  >;
  upToRsvp: Table<UpToRsvpRow, { upToId: string; userId: string; anonymous: boolean }> & {
    upsert(args: {
      where: { upToId_userId: { upToId: string; userId: string } };
      create: { upToId: string; userId: string; anonymous: boolean };
      update: { anonymous: boolean };
    }): Promise<UpToRsvpRow>;
  };
  poll: Table<PollRow, { upToId: string; question: string }>;
  pollSlot: Table<PollSlotRow, { pollId: string; label: string; order: number }>;
  pollResponse: Table<PollResponseRow, { slotId: string; userId: string; available: boolean }> & {
    upsert(args: {
      where: { slotId_userId: { slotId: string; userId: string } };
      create: { slotId: string; userId: string; available: boolean };
      update: { available: boolean };
    }): Promise<PollResponseRow>;
  };
  $transaction<T>(fn: (tx: UpTosDb) => Promise<T>): Promise<T>;
}
