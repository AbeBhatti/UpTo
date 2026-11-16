import type { UserRow } from "../verification/db.js";

/**
 * The slice of the database drops touch, with Prisma's method shapes so the
 * real PrismaClient (via a cast at the composition root, as for events) and
 * the in-memory ContentFakeDb both fit. Rows mirror prisma/schema.prisma:
 * Drop, DropVote, DropRulesAgreement. No query uses `include`.
 */

export type DropCategoryValue = "FREE_FOOD" | "POP_UP" | "RANDOM";
export type DropVoteKindValue = "HERE" | "GONE";

export interface DropRow {
  id: string;
  authorId: string;
  category: DropCategoryValue;
  text: string;
  lat: number;
  lng: number;
  expiresAt: Date;
  createdAt: Date;
  clientRef: string | null;
}

export interface DropVoteRow {
  id: string;
  dropId: string;
  userId: string;
  kind: DropVoteKindValue;
  createdAt: Date;
}

export interface DropRulesAgreementRow {
  id: string;
  userId: string;
  rulesVersion: number;
  agreedAt: Date;
}

type Filter = Record<string, unknown>;
type Order = Record<string, "asc" | "desc">;
type VoteKey = { dropId_userId: { dropId: string; userId: string } };

export interface DropsDb {
  user: { findUnique(args: { where: { id: string } }): Promise<UserRow | null> };
  drop: {
    findUnique(args: { where: { id: string } | { authorId_clientRef: { authorId: string; clientRef: string } } }): Promise<DropRow | null>;
    findMany(args: { where: Filter; orderBy?: Order | Order[] }): Promise<DropRow[]>;
    create(args: {
      data: { authorId: string; category: DropCategoryValue; text: string; lat: number; lng: number; expiresAt: Date; clientRef: string | null };
    }): Promise<DropRow>;
  };
  dropVote: {
    findUnique(args: { where: VoteKey }): Promise<DropVoteRow | null>;
    count(args: { where: Filter }): Promise<number>;
    upsert(args: {
      where: VoteKey;
      create: { dropId: string; userId: string; kind: DropVoteKindValue };
      update: { kind: DropVoteKindValue };
    }): Promise<DropVoteRow>;
    deleteMany(args: { where: Filter }): Promise<{ count: number }>;
  };
  dropRulesAgreement: {
    findUnique(args: { where: { userId: string } }): Promise<DropRulesAgreementRow | null>;
    upsert(args: {
      where: { userId: string };
      create: { userId: string; rulesVersion: number; agreedAt: Date };
      update: { rulesVersion: number; agreedAt: Date };
    }): Promise<DropRulesAgreementRow>;
  };
}
