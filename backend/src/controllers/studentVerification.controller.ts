import type {
  ApiResponse,
  AuthResponse,
  ConfirmCodeResponse,
  ErrorCode,
  SendCodeResponse,
} from "@upto/contracts";
import {
  MAX_ATTEMPTS,
  classOfRange,
  expiredCodesOf,
  isClassOfInRange,
  issueCampusVerificationCode,
  liveCodesOf,
} from "../services/verification/codes.js";
import { isUniqueClash, type CodeRow, type UserRow, type VerificationDb } from "../services/verification/db.js";
import { compareSecret } from "../services/verification/hashing.js";
import { SWITCH_TOKEN_TTL_MS, hashSwitchToken, newSwitchToken } from "../services/verification/switchToken.js";
import { toMe, toPublicUser } from "../services/verification/users.js";
import {
  confirmCodeSchema,
  sendCodeSchema,
  switchAccountSchema,
} from "../validators/studentVerification.validator.js";

/**
 * Student verification (Lab 6).
 *
 * Every function here is framework-free: it takes its dependencies and the
 * already-authenticated caller, and returns { status, body }. The route file
 * adapts that to Express.
 */

export interface VerificationDeps {
  db: VerificationDb;
  now: () => Date;
  /** Delivers the clear code to the student's mailbox. */
  deliverCode: (email: string, code: string) => Promise<void>;
  /** Overridable so tests can know the code without reading an email. */
  generateCode?: () => string;
  /** Node N10. Defaults to console.warn. */
  warn?: (message: string) => void;
}

export interface Caller {
  userId: string;
  /** The device the request came from; a switch token is bound to it. */
  deviceId: string;
}

export interface Reply<T> {
  status: number;
  body: ApiResponse<T>;
}

function fail<T>(status: number, code: ErrorCode, message: string, field?: string): Reply<T> {
  return { status, body: { ok: false, error: field ? { code, message, field } : { code, message } } };
}

function firstIssue(error: { issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }> }) {
  const issue = error.issues[0];
  const field = issue?.path[0];
  return { message: issue?.message ?? "Invalid request", field: typeof field === "string" ? field : undefined };
}

// ---------------------------------------------------------------------------
// POST /verify/send
// ---------------------------------------------------------------------------

/**
 * Sends a code. Deliberately says nothing about whether another account
 * already holds the address: that only comes out on confirm, to the person
 * who proved the mailbox.
 */
export async function sendVerificationCode(
  deps: VerificationDeps,
  caller: Caller,
  body: unknown,
): Promise<Reply<SendCodeResponse>> {
  const parsed = sendCodeSchema.safeParse(body);
  if (!parsed.success) {
    const { message, field } = firstIssue(parsed.error);
    return fail(400, "invalid_request", message, field);
  }

  const issued = await issueCampusVerificationCode(deps, { userId: caller.userId, email: parsed.data.email });
  if (!issued.ok) return fail(429, "rate_limited", "Too many codes sent. Try again in an hour.");

  await deps.deliverCode(parsed.data.email, issued.code);
  return { status: 200, body: { ok: true, data: { liveCodes: issued.liveCodes, expiresAt: issued.expiresAt.toISOString() } } };
}

// ---------------------------------------------------------------------------
// POST /verify/confirm — confirmVerification, Lab 6 V2, node for node.
//
// Up to 3 live codes per account. Any live code works. Using one spends all
// of them. The 5 wrong guesses are shared.
// ---------------------------------------------------------------------------

export async function confirmVerification(
  deps: VerificationDeps,
  caller: Caller,
  body: unknown,
): Promise<Reply<ConfirmCodeResponse>> {
  try {
    // N1: parse the body.
    const parsed = confirmCodeSchema.safeParse(body);
    if (!parsed.success) {
      const { message, field } = firstIssue(parsed.error);
      return fail(400, "invalid_request", message, field); // R1
    }

    // N2: code, classOf, email, userId, now; load the challenge.
    const { code, classOf, email } = parsed.data;
    const { userId } = caller;
    const { db } = deps;
    const now = deps.now();
    const challenge = await db.campusVerificationChallenge.findUnique({ where: { userId }, include: { codes: true } });

    // D2: build the live-code list; nothing live, or a different address.
    const live = liveCodesOf(challenge, now);
    if (challenge === null || challenge.email !== email || live.length === 0) {
      return fail(410, "expired", "This code has expired. Send a new one."); // R2
    }

    // D3: the shared budget is already spent.
    if (challenge.attempts >= MAX_ATTEMPTS) {
      return fail(410, "attempts_exhausted", "Too many wrong codes. Send a new one."); // R3
    }

    // N3: atomically take an attempt slot, keyed on the address.
    const slot = await db.campusVerificationChallenge.updateMany({
      where: { userId, email, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (slot.count !== 1) {
      // N4: re-read; did the address change under us?
      const current = await db.campusVerificationChallenge.findUnique({ where: { userId }, include: { codes: true } });
      if (current === null || current.email !== email) {
        return fail(410, "expired", "This code has expired. Send a new one."); // R4
      }
      return fail(410, "attempts_exhausted", "Too many wrong codes. Send a new one."); // R5
    }

    // L1: compare against each live code.
    let matched: CodeRow | null = null;
    for (const candidate of live) {
      if (await compareSecret(code, candidate.codeHash)) {
        matched = candidate;
        break;
      }
    }

    // D4: no live code matched.
    if (matched === null) {
      // S1: compare against the expired codes too, so a student opening an
      // old email is told it expired rather than that it is wrong.
      for (const stale of expiredCodesOf(challenge, now)) {
        if (await compareSecret(code, stale.codeHash)) {
          return fail(410, "expired", "That code has expired. Use the newest code or send a new one."); // RS
        }
      }

      // N5: no match anywhere. The attempt stays charged.
      const after = await db.campusVerificationChallenge.findUnique({ where: { userId }, include: { codes: true } });
      const left = Math.max(0, MAX_ATTEMPTS - (after?.attempts ?? MAX_ATTEMPTS));
      return fail(422, "incorrect", `That code is incorrect. ${left} ${left === 1 ? "try" : "tries"} left.`, "code");
    }

    // N6: define spendChallenge(); refund the attempt (a right code costs nothing).
    // Spending deletes the challenge row, which cascades to every code on it:
    // using one code spends all of them. Its count decides every race below.
    const challengeId = challenge.id;
    const spendChallenge = async (tx: VerificationDb): Promise<boolean> =>
      (await tx.campusVerificationChallenge.deleteMany({ where: { id: challengeId, userId, email } })).count === 1;
    await db.campusVerificationChallenge.updateMany({
      where: { userId, email, attempts: { gt: 0 } },
      data: { attempts: { decrement: 1 } },
    });

    // D5: class year range. Checked after the refund, so a bad year leaves
    // the code UNSPENT.
    if (!isClassOfInRange(classOf, now)) {
      const { min, max } = classOfRange(now);
      return fail(422, "class_of_out_of_range", `Class year must be between ${min} and ${max}.`, "classOf"); // R7
    }

    // N7: load me.
    const me = await db.user.findUnique({ where: { id: userId } });
    if (me === null) {
      return fail(410, "expired", "This account no longer exists."); // R8
    }

    // N8: does another account hold this address, as its proven campus
    // address or as its sign-in address?
    const holder = await db.user.findFirst({
      where: { id: { not: userId }, OR: [{ campusEmail: email }, { email }] },
    });

    if (holder !== null) {
      // N9: spend, then create ONE handoff. If the spend lost the race,
      // another tap already used this code.
      const switchToken = newSwitchToken();
      const handedOff = await db.$transaction(async (tx) => {
        if (!(await spendChallenge(tx))) return false;
        await tx.accountHandoff.create({
          data: {
            fromUserId: userId,
            toUserId: holder.id,
            email,
            tokenHash: hashSwitchToken(switchToken),
            deviceId: caller.deviceId,
            expiresAt: new Date(now.getTime() + SWITCH_TOKEN_TTL_MS),
          },
        });
        return true;
      });
      if (!handedOff) {
        return fail(410, "expired", "This code was already used."); // R9b
      }
      // R9: 409 campus_email_in_use, carrying the switch token.
      return { status: 409, body: { ok: true, data: { verified: false, switchToken, heldBy: toPublicUser(holder) } } };
    }

    // D7: the class year jumped by more than one year.
    if (me.classOf !== null && Math.abs(classOf - me.classOf) > 1) {
      // N10: warn.
      (deps.warn ?? console.warn)(`verification: user ${userId} class year changed from ${me.classOf} to ${classOf}`);
    }

    // N11: spend, then stamp the account. Losing the spend means another tap
    // already used a code on this challenge.
    let student: UserRow | null;
    try {
      student = await db.$transaction(async (tx) => {
        if (!(await spendChallenge(tx))) return null;
        const stamped = await tx.user.updateMany({
          where: { id: userId },
          data: { isVerifiedStudent: true, campusEmail: email, campusVerifiedAt: now, classOf },
        });
        if (stamped.count !== 1) return null;
        return tx.user.findUnique({ where: { id: userId } });
      });
    } catch (error) {
      // E1: a unique clash on the stamp means another account took the
      // address between N8 and N11.
      if (isUniqueClash(error)) {
        return fail(409, "campus_email_in_use", "Another account already holds this address."); // R12
      }
      throw error;
    }
    if (student === null) {
      return fail(410, "expired", "This code was already used."); // R10
    }

    // R11: verified.
    return { status: 200, body: { ok: true, data: { verified: true, user: toMe(student) } } };
  } catch {
    return fail(500, "server_error", "Something went wrong. Try again."); // R13
  }
}

// ---------------------------------------------------------------------------
// POST /verify/switch — deliberately thin.
//
// Redeems a switch token: bound to the account AND the device that earned
// it, expires, and is single use. Signing the student into the other account
// is the route's job (it sets the session).
// ---------------------------------------------------------------------------

export async function switchAccount(
  deps: Pick<VerificationDeps, "db" | "now">,
  caller: Caller,
  body: unknown,
): Promise<Reply<AuthResponse>> {
  const parsed = switchAccountSchema.safeParse(body);
  if (!parsed.success) {
    const { message, field } = firstIssue(parsed.error);
    return fail(400, "invalid_request", message, field);
  }

  const { db } = deps;
  const now = deps.now();
  const handoff = await db.accountHandoff.findUnique({ where: { tokenHash: hashSwitchToken(parsed.data.switchToken) } });
  if (handoff === null) return fail(410, "expired", "This switch link is no longer valid.");
  if (handoff.fromUserId !== caller.userId || handoff.deviceId !== caller.deviceId) {
    return fail(403, "forbidden", "This switch link belongs to another account or device.");
  }
  if (handoff.consumedAt !== null || handoff.expiresAt.getTime() <= now.getTime()) {
    return fail(410, "expired", "This switch link is no longer valid.");
  }

  const consumed = await db.accountHandoff.updateMany({
    where: { id: handoff.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return fail(410, "expired", "This switch link is no longer valid.");

  const target = await db.user.findUnique({ where: { id: handoff.toUserId } });
  if (target === null) return fail(410, "expired", "That account no longer exists.");

  return { status: 200, body: { ok: true, data: { user: toMe(target) } } };
}
