import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiResponse, AuthResponse, ErrorCode } from "@upto/contracts";
import { isUniqueClash, type UserRow } from "../services/verification/db.js";
import { compareSecret, hashSecret } from "../services/verification/hashing.js";
import { toMe } from "../services/verification/users.js";
import { googleSignInSchema, signInSchema, signUpSchema } from "../validators/auth.validator.js";

/**
 * Accounts: sign up, sign in, sessions, /auth/me, sign out.
 * Google sign-in is validated only; the OAuth flow is out of scope this week.
 *
 * Framework-free like the verification controller: each function returns
 * { status, body } and the route file adapts it to Express.
 */

type Filter = Record<string, unknown>;

export interface AuthDb {
  user: {
    findUnique(args: { where: { id: string } }): Promise<UserRow | null>;
    findFirst(args: { where: Filter }): Promise<UserRow | null>;
    create(args: { data: Filter }): Promise<UserRow>;
  };
}

export interface AuthDeps {
  db: AuthDb;
  now: () => Date;
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
// Sessions: a stateless, HMAC-signed token carrying the user id and expiry.
// There is no session table in the schema, so signing out clears the cookie.
// ---------------------------------------------------------------------------

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return "upto-dev-only-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function signSession(userId: string, now: Date): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now.getTime() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id a session token names, or null if it is forged or expired. */
export function readSession(token: string | undefined, now: Date): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: unknown; exp?: unknown };
    if (typeof uid !== "string" || typeof exp !== "number" || exp <= now.getTime()) return null;
    return uid;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

export async function signUp(deps: AuthDeps, body: unknown): Promise<Reply<AuthResponse>> {
  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    const { message, field } = firstIssue(parsed.error);
    return fail(400, "invalid_request", message, field);
  }
  const { username, name, email, phone, password, avatarSeed } = parsed.data;

  const taken = await deps.db.user.findFirst({
    where: {
      OR: [{ username }, ...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
  });
  if (taken !== null) {
    if (taken.username === username) return fail(400, "invalid_request", "That username is taken", "username");
    if (email && taken.email === email) return fail(400, "invalid_request", "An account already uses that email", "email");
    return fail(400, "invalid_request", "An account already uses that phone number", "phone");
  }

  try {
    const user = await deps.db.user.create({
      data: {
        username,
        name,
        email: email ?? null,
        phone: phone ?? null,
        passwordHash: await hashSecret(password),
        avatarSeed: avatarSeed ?? null,
      },
    });
    return { status: 201, body: { ok: true, data: { user: toMe(user) } } };
  } catch (error) {
    // Two sign-ups racing for the same username / email / phone.
    if (isUniqueClash(error)) return fail(400, "invalid_request", "That username, email or phone is already taken");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// POST /auth/signin
// ---------------------------------------------------------------------------

export async function signIn(deps: AuthDeps, body: unknown): Promise<Reply<AuthResponse>> {
  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    const { message, field } = firstIssue(parsed.error);
    return fail(400, "invalid_request", message, field);
  }
  const { identifier, password } = parsed.data;

  const user = await deps.db.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier.toLowerCase() }, { phone: identifier }] },
  });
  // Same answer whether the account is missing or the password is wrong.
  if (user === null || user.passwordHash === null || !(await compareSecret(password, user.passwordHash))) {
    return fail(401, "unauthorized", "Wrong username or password");
  }
  return { status: 200, body: { ok: true, data: { user: toMe(user) } } };
}

// ---------------------------------------------------------------------------
// POST /auth/google — validator only
// ---------------------------------------------------------------------------

export async function googleSignIn(_deps: AuthDeps, body: unknown): Promise<Reply<AuthResponse>> {
  const parsed = googleSignInSchema.safeParse(body);
  if (!parsed.success) {
    const { message, field } = firstIssue(parsed.error);
    return fail(400, "invalid_request", message, field);
  }
  return fail(501, "server_error", "Google sign-in is not available yet");
}

// ---------------------------------------------------------------------------
// GET /auth/me and POST /auth/signout
// ---------------------------------------------------------------------------

export async function me(deps: AuthDeps, userId: string | null): Promise<Reply<AuthResponse>> {
  if (userId === null) return fail(401, "unauthorized", "Sign in first.");
  const user = await deps.db.user.findUnique({ where: { id: userId } });
  if (user === null) return fail(401, "unauthorized", "Sign in first.");
  return { status: 200, body: { ok: true, data: { user: toMe(user) } } };
}

export function signOut(): Reply<null> {
  return { status: 200, body: { ok: true, data: null } };
}
