/**
 * The slice of the database the verification code touches, written with
 * Prisma's method shapes so the real PrismaClient and the in-memory FakeDb
 * both fit. Rows mirror prisma/schema.prisma.
 */

export interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  googleId: string | null;
  avatarSeed: string | null;
  avatarUrl: string | null;
  isVerifiedStudent: boolean;
  campusEmail: string | null;
  campusVerifiedAt: Date | null;
  classOf: number | null;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChallengeRow {
  id: string;
  userId: string;
  email: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  lastSentAt: Date | null;
  sendCount: number;
}

export interface CodeRow {
  id: string;
  challengeId: string;
  codeHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export type ChallengeWithCodes = ChallengeRow & { codes: CodeRow[] };

export interface HandoffRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  email: string;
  tokenHash: string;
  deviceId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

type Filter = Record<string, unknown>;
type Count = { count: number };

export interface VerificationDb {
  user: {
    findUnique(args: { where: { id: string } }): Promise<UserRow | null>;
    findFirst(args: { where: Filter }): Promise<UserRow | null>;
    updateMany(args: { where: Filter; data: Filter }): Promise<Count>;
  };
  campusVerificationChallenge: {
    findUnique(args: { where: { userId: string }; include: { codes: true } }): Promise<ChallengeWithCodes | null>;
    create(args: { data: Filter }): Promise<ChallengeRow>;
    update(args: { where: { id: string }; data: Filter }): Promise<ChallengeRow>;
    updateMany(args: { where: Filter; data: Filter }): Promise<Count>;
    deleteMany(args: { where: Filter }): Promise<Count>;
  };
  campusVerificationCode: {
    create(args: { data: Filter }): Promise<CodeRow>;
    deleteMany(args: { where: Filter }): Promise<Count>;
  };
  accountHandoff: {
    create(args: { data: Filter }): Promise<HandoffRow>;
    findUnique(args: { where: { tokenHash: string } }): Promise<HandoffRow | null>;
    updateMany(args: { where: Filter; data: Filter }): Promise<Count>;
  };
  $transaction<T>(fn: (tx: VerificationDb) => Promise<T>): Promise<T>;
}

/** Prisma's unique-constraint violation. Backs node E1 in confirmVerification. */
export function isUniqueClash(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
