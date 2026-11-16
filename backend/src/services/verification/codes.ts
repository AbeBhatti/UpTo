import { randomInt } from "node:crypto";
import type { ChallengeWithCodes, CodeRow, VerificationDb } from "./db.js";
import { hashSecret } from "./hashing.js";

/**
 * Campus verification codes (Lab 6).
 *
 * Up to 3 live codes per account. Any live code works. Using one spends all
 * of them. The 5 wrong guesses are shared, because `attempts` lives on the
 * challenge row (one per account), not on the code row.
 */

export const MAX_ATTEMPTS = 5;
export const MAX_LIVE_CODES = 3;
export const CODE_TTL_MS = 15 * 60 * 1000;
export const SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Codes that can still verify, oldest first. Lab 6 node D2. */
export function liveCodesOf(challenge: ChallengeWithCodes | null, now: Date): CodeRow[] {
  if (challenge === null) return [];
  return challenge.codes
    .filter((code) => code.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Codes still stored but past their expiry. Lab 6 node S1 compares these. */
export function expiredCodesOf(challenge: ChallengeWithCodes | null, now: Date): CodeRow[] {
  if (challenge === null) return [];
  return challenge.codes.filter((code) => code.expiresAt.getTime() <= now.getTime());
}

/**
 * Lab 6 node D5. A class year a current student could hold: this academic
 * year's graduating class through five years out. From July onward the
 * current calendar year's class has already graduated.
 */
export function classOfRange(now: Date): { min: number; max: number } {
  const year = now.getUTCFullYear();
  const min = now.getUTCMonth() >= 6 ? year + 1 : year;
  return { min, max: min + 5 };
}

export function isClassOfInRange(classOf: number, now: Date): boolean {
  const { min, max } = classOfRange(now);
  return Number.isInteger(classOf) && classOf >= min && classOf <= max;
}

export interface IssueDeps {
  db: VerificationDb;
  now: () => Date;
  /** Overridable so tests can know the code without reading an email. */
  generateCode?: () => string;
}

export type IssueResult =
  | { ok: true; code: string; liveCodes: number; expiresAt: Date }
  | { ok: false; reason: "rate_limited" };

/**
 * Sends a new code for `email` to account `userId`.
 *
 *  - One challenge per ACCOUNT. A second send to the same address ADDS a code.
 *  - Keeps at most MAX_LIVE_CODES, dropping the OLDEST first.
 *  - Expired codes are not carried onto the row by the next send.
 *  - A send to a DIFFERENT address kills the old codes: a code proves one mailbox.
 *  - Does NOT refill the attempt budget. Only a send after the budget is spent
 *    starts over with a fresh budget, and the dead codes stay dead.
 *  - At most SENDS_PER_HOUR sends per hour, counted on the challenge row.
 *  - Codes are hashed; the clear code is returned once, for delivery.
 */
export async function issueCampusVerificationCode(
  deps: IssueDeps,
  input: { userId: string; email: string },
): Promise<IssueResult> {
  const { userId, email } = input;
  const now = deps.now();
  const code = (deps.generateCode ?? generateCode)();
  const codeHash = await hashSecret(code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  return deps.db.$transaction(async (tx): Promise<IssueResult> => {
    const existing = await tx.campusVerificationChallenge.findUnique({ where: { userId }, include: { codes: true } });

    if (existing === null) {
      const created = await tx.campusVerificationChallenge.create({
        data: { userId, email, attempts: 0, lastSentAt: now, sendCount: 1 },
      });
      await tx.campusVerificationCode.create({
        data: { challengeId: created.id, codeHash, expiresAt, createdAt: now },
      });
      return { ok: true, code, liveCodes: 1, expiresAt };
    }

    const withinHour = existing.lastSentAt !== null && now.getTime() - existing.lastSentAt.getTime() < HOUR_MS;
    const sendCount = withinHour ? existing.sendCount + 1 : 1;
    if (sendCount > SENDS_PER_HOUR) return { ok: false, reason: "rate_limited" };

    const sameAddress = existing.email === email;
    const budgetSpent = existing.attempts >= MAX_ATTEMPTS;
    const kept = sameAddress && !budgetSpent ? liveCodesOf(existing, now).slice(-(MAX_LIVE_CODES - 1)) : [];

    await tx.campusVerificationCode.deleteMany({
      where: { challengeId: existing.id, id: { notIn: kept.map((c) => c.id) } },
    });
    await tx.campusVerificationChallenge.update({
      where: { id: existing.id },
      data: { email, attempts: budgetSpent ? 0 : existing.attempts, lastSentAt: now, sendCount },
    });
    await tx.campusVerificationCode.create({
      data: { challengeId: existing.id, codeHash, expiresAt, createdAt: now },
    });
    return { ok: true, code, liveCodes: kept.length + 1, expiresAt };
  });
}
