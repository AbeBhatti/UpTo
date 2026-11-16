/**
 * Lab 6 — confirmVerification, every node of the V2 control flow graph.
 *
 * Runs over HTTP against the real router, backed by the in-memory FakeDb.
 * Each test names the nodes it is there to reach. The four races use Lab 6's
 * slowDown() so two requests overlap the same way on every run.
 *
 * Honest note: Lab 6 documents a DIFF between two versions (V1 -> V2) and
 * selects 24 of 36 existing tests. A fresh build has only one version, so
 * that selection cannot be reproduced here. What this file reproduces is V2
 * itself, with a test reaching every node.
 *
 *   npx tsx --test --test-reporter=spec src/routes/studentVerification.route.test.ts
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import express from "express";
import { MAX_ATTEMPTS, SENDS_PER_HOUR } from "../services/verification/codes.js";
import type { VerificationDb } from "../services/verification/db.js";
import { db, slowDown } from "../services/verification/fakeDb.js";
import { studentVerificationRouter } from "./studentVerification.route.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const START = new Date("2026-11-15T18:00:00Z").getTime();
const MINUTE = 60 * 1000;
const CLASS_OF = 2028;

let clock = START;
const now = () => new Date(clock);
db.clock = now;

let inbox: Array<{ email: string; code: string }> = [];
let warnings: string[] = [];
let codeCounter = 0;

const app = express();
app.use(express.json());
app.use(
  studentVerificationRouter({
    db: db as unknown as VerificationDb,
    now,
    deliverCode: async (email, code) => {
      inbox.push({ email, code });
    },
    // Distinct, predictable codes that never collide with the wrong guesses
    // the tests use ("000000", "111111", "999999").
    generateCode: () => String(200000 + (codeCounter += 1) * 37),
    warn: (message) => {
      warnings.push(message);
    },
    currentUserId: (request) => request.header("x-user-id") ?? null,
    startSession: (response, userId) => {
      response.setHeader("x-session-user", userId);
    },
  }),
);

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

beforeEach(() => {
  db.reset();
  clock = START;
  inbox = [];
  warnings = [];
  codeCounter = 0;
  userCounter = 0;
});

interface Account {
  id: string;
  [field: string]: unknown;
}

interface ReplyOf {
  status: number;
  body: any;
  headers: Headers;
}

let userCounter = 0;

/** A plain, unverified account, written straight into the fake. */
function account(fields: Record<string, unknown> = {}): Account {
  userCounter += 1;
  const row = {
    id: `user_${userCounter}`,
    username: `student${userCounter}`,
    name: `Student ${userCounter}`,
    email: null,
    phone: null,
    passwordHash: null,
    googleId: null,
    avatarSeed: null,
    avatarUrl: null,
    isVerifiedStudent: false,
    campusEmail: null,
    campusVerifiedAt: null,
    classOf: null,
    isAdmin: false,
    createdAt: now(),
    updatedAt: now(),
    ...fields,
  };
  db.tables.user.push(row);
  return row;
}

/** An account that already proved its campus address. */
function verifiedAccount(fields: Record<string, unknown> = {}): Account {
  return account({ isVerifiedStudent: true, campusVerifiedAt: now(), classOf: CLASS_OF, ...fields });
}

async function post(path: string, me: Account | null, body: unknown, device = "device-1"): Promise<ReplyOf> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-device-id": device };
  if (me) headers["x-user-id"] = me.id;
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const send = (me: Account | null, email: string) => post("/verify/send", me, { email });
const confirm = (me: Account | null, body: unknown, device?: string) => post("/verify/confirm", me, body, device);
const switchTo = (me: Account | null, body: unknown, device?: string) => post("/verify/switch", me, body, device);

/** Sends a code and returns it, optionally pre-spending some of the budget. */
async function liveCode(me: Account, email: string, options: { attempts?: number } = {}): Promise<string> {
  const reply = await send(me, email);
  assert.equal(reply.status, 200, `send failed: ${JSON.stringify(reply.body)}`);
  const delivered = inbox.at(-1);
  assert.ok(delivered && delivered.email === email.trim().toLowerCase());
  if (options.attempts !== undefined) challengeOf(me.id)!.attempts = options.attempts;
  return delivered.code;
}

function challengeOf(userId: string): any {
  return db.tables.campusVerificationChallenge.find((row) => row.userId === userId);
}

function codesOf(userId: string): any[] {
  const challenge = challengeOf(userId);
  return challenge ? db.tables.campusVerificationCode.filter((code) => code.challengeId === challenge.id) : [];
}

function userRow(id: string): any {
  return db.tables.user.find((row) => row.id === id);
}

const reason = (reply: ReplyOf): string | undefined => (reply.body.ok ? undefined : reply.body.error.code);

/** Like slowDown, but the call throws: reaches the defensive catch paths. */
function breakCall(model: "user" | "campusVerificationChallenge", method: string): () => void {
  const base = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(db), model)!.get!;
  Object.defineProperty(db, model, {
    configurable: true,
    get() {
      const m = base.call(db);
      m[method] = async () => {
        throw new Error("database unavailable");
      };
      return m;
    },
  });
  return () => delete (db as any)[model];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  // A failed test must not leave a slowed or broken model behind.
  delete (db as any).user;
  delete (db as any).campusVerificationChallenge;
});

// ---------------------------------------------------------------------------
// Sending codes (issueCampusVerificationCode)
// ---------------------------------------------------------------------------

describe("send", () => {
  test("send refuses a personal address, a tagged one and a non-address, each by its own reason", async () => {
    const me = account();
    const personal = await send(me, "bronco@gmail.com");
    const tagged = await send(me, "bronco+events@scu.edu");
    const nonAddress = await send(me, "not an address");
    for (const reply of [personal, tagged, nonAddress]) {
      assert.equal(reply.status, 400);
      assert.equal(reason(reply), "invalid_request");
    }
    assert.match(personal.body.error.message, /@scu\.edu address, not a personal one/);
    assert.match(tagged.body.error.message, /without a \+tag/);
    assert.match(nonAddress.body.error.message, /not an email address/);
    assert.equal(inbox.length, 0, "nothing was sent");
  });

  test("send needs a session", async () => {
    const reply = await send(null, "bronco@scu.edu");
    assert.equal(reply.status, 401);
    assert.equal(reason(reply), "unauthorized");
  });

  test("send writes one challenge per ACCOUNT, and a second send to the same address ADDS a code", async () => {
    const me = account();
    const first = await send(me, "bronco@scu.edu");
    const second = await send(me, "bronco@scu.edu");
    assert.equal(first.body.data.liveCodes, 1);
    assert.equal(second.body.data.liveCodes, 2);
    assert.equal(db.tables.campusVerificationChallenge.length, 1);
    assert.equal(codesOf(me.id).length, 2);
  });

  test("codes are hashed, never stored in the clear", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    const [stored] = codesOf(me.id);
    assert.notEqual(stored.codeHash, code);
    assert.ok(!stored.codeHash.includes(code));
  });

  test("send says nothing about whether another account already holds the address", async () => {
    verifiedAccount({ campusEmail: "held@scu.edu" });
    const free = await send(account(), "free@scu.edu");
    const held = await send(account(), "held@scu.edu");
    assert.equal(held.status, free.status);
    assert.deepEqual(Object.keys(held.body.data).sort(), Object.keys(free.body.data).sort());
  });

  test("an account holds at most MAX_LIVE_CODES codes, and the oldest is dropped first", async () => {
    const me = account();
    const dropped = await liveCode(me, "bronco@scu.edu");
    await liveCode(me, "bronco@scu.edu");
    await liveCode(me, "bronco@scu.edu");
    const fourth = await send(me, "bronco@scu.edu");
    assert.equal(fourth.body.data.liveCodes, 3);
    assert.equal(codesOf(me.id).length, 3);

    // S1 F, N5: the dropped code is simply wrong now.
    const old = await confirm(me, { email: "bronco@scu.edu", code: dropped, classOf: CLASS_OF });
    assert.equal(old.status, 422);
    assert.equal(reason(old), "incorrect");

    // L1 match with the newest.
    const newest = await confirm(me, { email: "bronco@scu.edu", code: inbox.at(-1)!.code, classOf: CLASS_OF });
    assert.equal(newest.status, 200);
  });

  test("the hourly send limit is unchanged by keeping codes", async () => {
    const me = account();
    for (let i = 0; i < SENDS_PER_HOUR; i += 1) assert.equal((await send(me, "bronco@scu.edu")).status, 200);
    const limited = await send(me, "bronco@scu.edu");
    assert.equal(limited.status, 429);
    assert.equal(reason(limited), "rate_limited");
    assert.equal(inbox.length, SENDS_PER_HOUR);

    clock += 61 * MINUTE;
    assert.equal((await send(me, "bronco@scu.edu")).status, 200);
  });

  test("a send that keeps the old code does not refill the guesses", async () => {
    const me = account();
    await liveCode(me, "bronco@scu.edu");
    for (const guess of ["000000", "111111"]) {
      assert.equal((await confirm(me, { email: "bronco@scu.edu", code: guess, classOf: CLASS_OF })).status, 422);
    }
    assert.equal(challengeOf(me.id).attempts, 2);
    await liveCode(me, "bronco@scu.edu");
    assert.equal(challengeOf(me.id).attempts, 2, "a new code buys no extra guesses");
  });

  test("a send after the budget is spent starts over: fresh budget, and the dead codes stay dead", async () => {
    const me = account();
    const dead = await liveCode(me, "bronco@scu.edu", { attempts: MAX_ATTEMPTS });
    const fresh = await liveCode(me, "bronco@scu.edu");
    assert.equal(challengeOf(me.id).attempts, 0);
    assert.equal(codesOf(me.id).length, 1);

    const old = await confirm(me, { email: "bronco@scu.edu", code: dead, classOf: CLASS_OF });
    assert.equal(reason(old), "incorrect");
    const ok = await confirm(me, { email: "bronco@scu.edu", code: fresh, classOf: CLASS_OF });
    assert.equal(ok.status, 200);
  });

  test("an expired code is not carried onto the row by the next send", async () => {
    const me = account();
    const expired = await liveCode(me, "bronco@scu.edu");
    clock += 16 * MINUTE;
    const fresh = await liveCode(me, "bronco@scu.edu");
    assert.equal(codesOf(me.id).length, 1);

    // S1 F, N5: the expired code is gone, so it is just wrong.
    const old = await confirm(me, { email: "bronco@scu.edu", code: expired, classOf: CLASS_OF });
    assert.equal(old.status, 422);
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code: fresh, classOf: CLASS_OF })).status, 200);
  });

  test("a send to a DIFFERENT address kills the old code: a code proves one mailbox", async () => {
    const me = account();
    const first = await liveCode(me, "first@scu.edu");
    await liveCode(me, "second@scu.edu");

    // D2 T: the old address no longer has a challenge.
    const oldAddress = await confirm(me, { email: "first@scu.edu", code: first, classOf: CLASS_OF });
    assert.equal(oldAddress.status, 410);
    assert.equal(reason(oldAddress), "expired");

    // D4 T, S1 F, N5: the old address's code is rejected for the new address.
    const crossed = await confirm(me, { email: "second@scu.edu", code: first, classOf: CLASS_OF });
    assert.equal(crossed.status, 422);
    assert.equal(reason(crossed), "incorrect");
  });
});

// ---------------------------------------------------------------------------
// confirmVerification, node by node
// ---------------------------------------------------------------------------

describe("confirmVerification", () => {
  test("N1 -> R1: a body that fails to parse is 400 invalid_request", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    const cases = [
      { email: "bronco@scu.edu", code: "12345", classOf: CLASS_OF },
      { email: "bronco@scu.edu", code },
      { email: "bronco@scu.edu", code, classOf: "2028" },
      { email: "bronco@scu.edu", code, classOf: CLASS_OF, userId: "someone-else" },
    ];
    for (const body of cases) {
      const reply = await confirm(me, body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      assert.equal(reason(reply), "invalid_request");
    }
    assert.equal(challengeOf(me.id).attempts, 0, "a malformed body costs no attempt");
  });

  test("confirm needs a session", async () => {
    const reply = await confirm(null, { email: "bronco@scu.edu", code: "123456", classOf: CLASS_OF });
    assert.equal(reply.status, 401);
  });

  test("N2, D2 -> R2: no challenge, an expired code, or a different address is 410 expired", async () => {
    const me = account();
    const none = await confirm(me, { email: "bronco@scu.edu", code: "123456", classOf: CLASS_OF });
    assert.equal(none.status, 410);
    assert.equal(reason(none), "expired");

    const code = await liveCode(me, "bronco@scu.edu");
    const otherAddress = await confirm(me, { email: "other@scu.edu", code, classOf: CLASS_OF });
    assert.equal(otherAddress.status, 410);
    assert.equal(reason(otherAddress), "expired");

    clock += 16 * MINUTE;
    const expired = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
    assert.equal(expired.status, 410);
    assert.equal(reason(expired), "expired");
  });

  test("a code belongs to the account that asked for it, and nobody else may spend it", async () => {
    const owner = account();
    const code = await liveCode(owner, "bronco@scu.edu");
    const thief = account();
    const reply = await confirm(thief, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
    assert.equal(reply.status, 410);
    assert.ok(challengeOf(owner.id), "the owner's code is untouched");
  });

  test("D3 -> R3: a spent budget is 410 attempts_exhausted, even with the right code", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu", { attempts: MAX_ATTEMPTS });
    const reply = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
    assert.equal(reply.status, 410);
    assert.equal(reason(reply), "attempts_exhausted");
  });

  test("N3, L1, D4, S1 F -> N5: A WRONG CODE IS 422, NEVER 401, and costs one attempt", async () => {
    const me = account();
    await liveCode(me, "bronco@scu.edu");
    const reply = await confirm(me, { email: "bronco@scu.edu", code: "000000", classOf: CLASS_OF });
    assert.equal(reply.status, 422);
    assert.equal(reason(reply), "incorrect");
    assert.match(reply.body.error.message, /4 tries left/);
    assert.equal(challengeOf(me.id).attempts, 1);
  });

  test("the attempt budget counts down and then the code is dead", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      assert.equal(reason(await confirm(me, { email: "bronco@scu.edu", code: "000000", classOf: CLASS_OF })), "incorrect");
    }
    const dead = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
    assert.equal(reason(dead), "attempts_exhausted");
  });

  test("the wrong-guess budget is SHARED by the live codes: two codes do not double the guesses", async () => {
    const me = account();
    const first = await liveCode(me, "bronco@scu.edu");
    const second = await liveCode(me, "bronco@scu.edu");
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      assert.equal((await confirm(me, { email: "bronco@scu.edu", code: "999999", classOf: CLASS_OF })).status, 422);
    }
    for (const code of [first, second]) {
      assert.equal(reason(await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF })), "attempts_exhausted");
    }
  });

  test("wrong guesses fired TOGETHER each cost an attempt, and no more than the cap", async () => {
    const me = account();
    await liveCode(me, "bronco@scu.edu");
    const guesses = Array.from({ length: 8 }, () =>
      confirm(me, { email: "bronco@scu.edu", code: "000000", classOf: CLASS_OF }),
    );
    const replies = await Promise.all(guesses);
    assert.equal(replies.filter((r) => reason(r) === "incorrect").length, MAX_ATTEMPTS);
    assert.equal(replies.filter((r) => reason(r) === "attempts_exhausted").length, 8 - MAX_ATTEMPTS);
    assert.equal(challengeOf(me.id).attempts, MAX_ATTEMPTS);
  });

  test("L1: the FIRST code still works after a second send to the same address", async () => {
    const me = account();
    const first = await liveCode(me, "bronco@scu.edu");
    await liveCode(me, "bronco@scu.edu");
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code: first, classOf: CLASS_OF })).status, 200);
  });

  test("L1: the SECOND code works too", async () => {
    const me = account();
    await liveCode(me, "bronco@scu.edu");
    const second = await liveCode(me, "bronco@scu.edu");
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code: second, classOf: CLASS_OF })).status, 200);
  });

  test("confirming with either code clears BOTH", async () => {
    const me = account();
    const first = await liveCode(me, "bronco@scu.edu");
    const second = await liveCode(me, "bronco@scu.edu");
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code: first, classOf: CLASS_OF })).status, 200);
    assert.equal(challengeOf(me.id), undefined);
    assert.equal(db.tables.campusVerificationCode.length, 0);
    // L1 match, then R2: the other code was spent too.
    const other = await confirm(me, { email: "bronco@scu.edu", code: second, classOf: CLASS_OF });
    assert.equal(other.status, 410);
    assert.equal(reason(other), "expired");
  });

  test("S1 T -> RS: an EXPIRED previous code answers 410, while the newer one still works", async () => {
    const me = account();
    const older = await liveCode(me, "bronco@scu.edu");
    clock += 10 * MINUTE;
    const newer = await liveCode(me, "bronco@scu.edu");
    clock += 6 * MINUTE; // older expired at +15 min, newer lives until +25 min

    const stale = await confirm(me, { email: "bronco@scu.edu", code: older, classOf: CLASS_OF });
    assert.equal(stale.status, 410);
    assert.equal(reason(stale), "expired");
    assert.match(stale.body.error.message, /expired/);

    assert.equal((await confirm(me, { email: "bronco@scu.edu", code: newer, classOf: CLASS_OF })).status, 200);
  });

  test("N6: the RIGHT code costs no attempt, even when the class year sends it back", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu", { attempts: 3 });
    await confirm(me, { email: "bronco@scu.edu", code, classOf: 1999 });
    assert.equal(challengeOf(me.id).attempts, 3);
  });

  test("D5 -> R7: the class year is range-checked, and leaves the code UNSPENT when it is wrong", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    for (const classOf of [1999, 2026, 2040]) {
      const reply = await confirm(me, { email: "bronco@scu.edu", code, classOf });
      assert.equal(reply.status, 422, String(classOf));
      assert.equal(reason(reply), "class_of_out_of_range");
      assert.equal(reply.body.error.field, "classOf");
    }
    assert.ok(challengeOf(me.id), "the code is still live");
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF })).status, 200);
  });

  test("N7 -> R8: an account that no longer exists is 410 expired", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    db.tables.user = db.tables.user.filter((row) => row.id !== me.id);
    const reply = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
    assert.equal(reply.status, 410);
    assert.equal(reason(reply), "expired");
  });

  test("N8, N9 -> R9: an address another account holds is 409 with a switch token, and the code is spent", async () => {
    const holder = verifiedAccount({ campusEmail: "held@scu.edu" });
    const me = account();
    const code = await liveCode(me, "held@scu.edu");
    const reply = await confirm(me, { email: "held@scu.edu", code, classOf: CLASS_OF });

    assert.equal(reply.status, 409);
    assert.equal(reply.body.data.verified, false);
    assert.equal(typeof reply.body.data.switchToken, "string");
    assert.equal(reply.body.data.heldBy.id, holder.id);
    assert.deepEqual(Object.keys(reply.body.data.heldBy).sort(), ["avatarSeed", "avatarUrl", "id", "name", "username"]);

    assert.equal(challengeOf(me.id), undefined, "the code is spent");
    assert.equal(db.tables.accountHandoff.length, 1);
    const [handoff] = db.tables.accountHandoff;
    assert.equal(handoff.fromUserId, me.id);
    assert.equal(handoff.toUserId, holder.id);
    assert.equal(handoff.deviceId, "device-1");
    assert.notEqual(handoff.tokenHash, reply.body.data.switchToken, "only the hash is stored");
    assert.equal(userRow(me.id).isVerifiedStudent, false, "nothing is stamped on a 409");
  });

  test("N8: an account whose SIGN-IN address is the SCU one also counts as holding it", async () => {
    const holder = account({ email: "signin@scu.edu" });
    const me = account();
    const code = await liveCode(me, "signin@scu.edu");
    const reply = await confirm(me, { email: "signin@scu.edu", code, classOf: CLASS_OF });
    assert.equal(reply.status, 409);
    assert.equal(reply.body.data.heldBy.id, holder.id);
  });

  test("D7 T -> N10: a class year that jumps by more than a year is stamped, with a warning", async () => {
    const me = account({ classOf: 2027 });
    const code = await liveCode(me, "bronco@scu.edu");
    const reply = await confirm(me, { email: "bronco@scu.edu", code, classOf: 2030 });
    assert.equal(reply.status, 200);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /2027 to 2030/);
  });

  test("D7 F: a class year within a year raises no warning", async () => {
    const me = account({ classOf: 2027 });
    const code = await liveCode(me, "bronco@scu.edu");
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF })).status, 200);
    assert.equal(warnings.length, 0);
  });

  test("N11 -> R11: a successful confirm stamps the account, spends the code, and answers with the student", async () => {
    const me = account();
    const code = await liveCode(me, "Bronco@SCU.edu");
    const reply = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });

    assert.equal(reply.status, 200);
    assert.equal(reply.body.data.verified, true);
    assert.equal(reply.body.data.user.id, me.id);
    assert.equal(reply.body.data.user.isVerifiedStudent, true);
    assert.equal(reply.body.data.user.campusEmail, "bronco@scu.edu");
    assert.equal(reply.body.data.user.classOf, CLASS_OF);
    assert.equal(reply.body.data.user.passwordHash, undefined, "only the Me fields go out");

    const row = userRow(me.id);
    assert.equal(row.isVerifiedStudent, true);
    assert.equal(row.campusVerifiedAt.getTime(), START);
    assert.equal(challengeOf(me.id), undefined);
  });

  test("a second confirm with the same code is 410, not a second stamp", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    assert.equal((await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF })).status, 200);
    const again = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
    assert.equal(again.status, 410);
    assert.equal(reason(again), "expired");
  });

  test("E1 F -> R13: a failure that is not a unique clash is a 500, not a crash", async () => {
    const me = account();
    const code = await liveCode(me, "bronco@scu.edu");
    const restore = breakCall("user", "updateMany");
    try {
      const reply = await confirm(me, { email: "bronco@scu.edu", code, classOf: CLASS_OF });
      assert.equal(reply.status, 500);
      assert.equal(reason(reply), "server_error");
    } finally {
      restore();
    }
  });

  test("R13: the outer catch answers 500 when the database is down", async () => {
    const me = account();
    await liveCode(me, "bronco@scu.edu");
    const restore = breakCall("campusVerificationChallenge", "findUnique");
    try {
      const reply = await confirm(me, { email: "bronco@scu.edu", code: "000000", classOf: CLASS_OF });
      assert.equal(reply.status, 500);
      assert.equal(reason(reply), "server_error");
    } finally {
      restore();
    }
  });

  test("N3 F -> N4 T -> R4: the address changed while we were taking a slot is 410 expired", async () => {
    const me = account();
    const code = await liveCode(me, "first@scu.edu");

    const restore = slowDown("campusVerificationChallenge", "updateMany", 150); // hold N3 open
    try {
      const pending = confirm(me, { email: "first@scu.edu", code, classOf: CLASS_OF });
      await sleep(30);
      assert.equal((await send(me, "second@scu.edu")).status, 200); // moves the challenge
      const reply = await pending;
      assert.equal(reply.status, 410);
      assert.equal(reason(reply), "expired");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// The four races
// ---------------------------------------------------------------------------

describe("races", () => {
  test("two taps with the two different codes verify once, and the loser is told the code expired", async () => {
    const me = account();
    const first = await liveCode(me, "bronco@scu.edu");
    const second = await liveCode(me, "bronco@scu.edu");

    const restore = slowDown("user", "findFirst"); // both taps pass the code check before either spends
    try {
      const replies = await Promise.all([
        confirm(me, { email: "bronco@scu.edu", code: first, classOf: CLASS_OF }),
        confirm(me, { email: "bronco@scu.edu", code: second, classOf: CLASS_OF }),
      ]);
      // N11 T -> R10 for the loser.
      assert.deepEqual(replies.map((r) => r.status).sort(), [200, 410]);
      assert.equal(replies.map(reason).filter(Boolean)[0], "expired");
      assert.equal(challengeOf(me.id), undefined);
    } finally {
      restore();
    }
  });

  // -------------------------------------------------------------------------
  // Lab 6: new regression tests for two paths no existing test reaches.
  // Both are races, so each one slows a single fake-database call by 30 ms to
  // make the two requests overlap the same way every run.
  // -------------------------------------------------------------------------

  test("LAB6: two taps on an address another account holds make ONE handoff; the loser is told the code expired", async () => {
    verifiedAccount({ email: "held@scu.edu", campusEmail: "held@scu.edu", googleId: "g-held" });
    const me = account({ email: "mine@icloud.com", appleId: "a-mine" });
    const code = await liveCode(me, "held@scu.edu");

    const restore = slowDown("user", "findFirst"); // both taps pass the code check before either spends it
    try {
      const replies = await Promise.all([
        confirm(me, { email: "held@scu.edu", code, classOf: CLASS_OF }),
        confirm(me, { email: "held@scu.edu", code, classOf: CLASS_OF }),
      ]);
      assert.deepEqual(replies.map((r) => r.status).sort(), [409, 410]);
      assert.equal(db.tables.accountHandoff.length, 1, "one code can produce only one handoff");
      assert.equal(challengeOf(me.id), undefined, "the code is spent");
    } finally {
      restore();
    }
  });

  test("LAB6: two wrong guesses racing for the LAST attempt: one is charged, the other is told the budget is spent", async () => {
    const me = account();
    await liveCode(me, "last@scu.edu", { attempts: 4 });

    const restore = slowDown("campusVerificationChallenge", "updateMany"); // both read 4 attempts before either takes a slot
    try {
      const replies = await Promise.all([
        confirm(me, { email: "last@scu.edu", code: "000000", classOf: CLASS_OF }),
        confirm(me, { email: "last@scu.edu", code: "111111", classOf: CLASS_OF }),
      ]);
      assert.deepEqual(replies.map((r) => reason(r)).sort(), ["attempts_exhausted", "incorrect"]);
      assert.equal(challengeOf(me.id)!.attempts, 5, "never more than the cap");
    } finally {
      restore();
    }
  });

  test("two accounts racing for one address: one 200, one 409, and never two stamps", async () => {
    const a = account();
    const b = account();
    const codeA = await liveCode(a, "race@scu.edu");
    const codeB = await liveCode(b, "race@scu.edu");

    const restore = slowDown("user", "updateMany"); // both pass N8 (no holder yet) before either stamp lands
    try {
      const replies = await Promise.all([
        confirm(a, { email: "race@scu.edu", code: codeA, classOf: CLASS_OF }),
        confirm(b, { email: "race@scu.edu", code: codeB, classOf: CLASS_OF }),
      ]);
      // E1 T -> R12 for the loser.
      assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
      const loser = replies.find((r) => r.status === 409)!;
      assert.equal(reason(loser), "campus_email_in_use");
      assert.equal(db.tables.user.filter((row) => row.campusEmail === "race@scu.edu").length, 1, "never two stamps");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Switching accounts (thin: issue, bind, expire, refuse reuse)
// ---------------------------------------------------------------------------

describe("switch", () => {
  async function earnSwitchToken() {
    const holder = verifiedAccount({ campusEmail: "held@scu.edu" });
    const me = account();
    const code = await liveCode(me, "held@scu.edu");
    const reply = await confirm(me, { email: "held@scu.edu", code, classOf: CLASS_OF });
    assert.equal(reply.status, 409);
    return { holder, me, switchToken: reply.body.data.switchToken as string };
  }

  test("switch signs the student into the account that holds their address", async () => {
    const { holder, me, switchToken } = await earnSwitchToken();
    const reply = await switchTo(me, { switchToken });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.data.user.id, holder.id);
    assert.equal(reply.headers.get("x-session-user"), holder.id);
  });

  test("a switch token is single use ON ITS OWN, not merely because the session ended", async () => {
    const { me, switchToken } = await earnSwitchToken();
    assert.equal((await switchTo(me, { switchToken })).status, 200);
    const reuse = await switchTo(me, { switchToken });
    assert.equal(reuse.status, 410);
    assert.equal(reason(reuse), "expired");
  });

  test("a switch token is bound to the account AND the device that earned it", async () => {
    const { me, switchToken } = await earnSwitchToken();
    const otherDevice = await switchTo(me, { switchToken }, "device-2");
    assert.equal(otherDevice.status, 403);
    const otherAccount = await switchTo(account(), { switchToken });
    assert.equal(otherAccount.status, 403);
    assert.equal(db.tables.accountHandoff[0].consumedAt, null, "a refused attempt does not burn the token");
    assert.equal((await switchTo(me, { switchToken })).status, 200);
  });

  test("an expired switch token is refused", async () => {
    const { me, switchToken } = await earnSwitchToken();
    clock += 11 * MINUTE;
    const reply = await switchTo(me, { switchToken });
    assert.equal(reply.status, 410);
    assert.equal(reason(reply), "expired");
  });

  test("a made-up switch token is refused and writes nothing", async () => {
    const { me } = await earnSwitchToken();
    const before = structuredClone(db.tables.accountHandoff);
    const reply = await switchTo(me, { switchToken: "made-up-token" });
    assert.equal(reply.status, 410);
    assert.deepEqual(db.tables.accountHandoff, before);
  });

  test("switch needs a session", async () => {
    const reply = await switchTo(null, { switchToken: "anything" });
    assert.equal(reply.status, 401);
  });
});
