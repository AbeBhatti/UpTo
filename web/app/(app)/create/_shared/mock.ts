/**
 * Fixture-backed stand-in for the API, used only while
 * NEXT_PUBLIC_USE_FIXTURES=true (or NEXT_PUBLIC_API_URL is unset). It returns exactly the contract
 * envelope and the error codes Abe's and Abhi's endpoints will return, so the
 * screens are built against the real failure paths, not just the happy one.
 *
 * Verify cheat sheet (fixture mode only):
 *   123456 ............ a live code — accepted
 *   000000 ............ an expired code — 410 expired (Lab 6 S1 / RS)
 *   anything else ..... 422 incorrect; the 6th try is 410 attempts_exhausted
 *   aala@scu.edu ...... already held by @abhi — the 409 switch path
 *   classOf outside Abe's range (Fall 2026: 2027–2032) → 422 class_of_out_of_range
 *   6th send in a session → 429 rate_limited
 *
 * Sign in: identifier "abhi" (or abhi@example.com), any 6+ char password.
 *
 * Share page: /u/k3f9qz is the fixture Up-To; anything you publish in this
 * tab also opens (client-side navigation keeps the mock's memory).
 */
import type {
  ApiResponse,
  CampusEvent,
  PendingEventsResponse,
  Report,
  AuthResponse,
  ConfirmCodeResponse,
  ErrorCode,
  Me,
  Message,
  Room,
  RouteKey,
  SendCodeResponse,
  UpTo,
} from "@upto/contracts";
import { DROPS, EVENTS, ME, NOW, PEOPLE, ROOMS, UPTOS } from "@upto/fixtures";
import { UPTO_DESCRIPTION_MAX, codePointLength, toDescriptionField } from "./description";

export const MOCK_LIVE_CODE = "123456";
export const MOCK_EXPIRED_CODE = "000000";
const MAX_ATTEMPTS = 5;
const MAX_LIVE_CODES = 3;
const MAX_SENDS = 5;

const state = {
  sends: 0,
  liveCodes: 0,
  attempts: 0,
  createdUpTos: new Map<string, UpTo>(),
};

const LIZ = PEOPLE[1]!;

// ----- Admin ---------------------------------------------------------------
// The fixture's one PENDING event plus two more, so approve and reject can
// both be tried. Approving moves an event to APPROVED, which is what makes it
// show in the student feed once Abhi's endpoint is real.
const extraPending: CampusEvent[] = EVENTS.filter((e) => e.reviewStatus === "APPROVED")
  .slice(0, 2)
  .map((e, i) => ({
    ...e,
    id: `evt_pending_mock_${i + 1}`,
    title: i === 0 ? "Open Mic Night (from flyer)" : "Resume Review Drop-in (from flyer)",
    reviewStatus: "PENDING" as const,
    goingCount: 0,
    myStatus: null,
    source: { id: "src_flyer", type: "FLYER", label: "Flyer upload" },
  }));
const adminState = {
  events: new Map<string, CampusEvent>(
    [...EVENTS.filter((e) => e.reviewStatus === "PENDING"), ...extraPending].map((e) => [e.id, e]),
  ),
};

// ----- Chat ----------------------------------------------------------------
// The fixture's group room plus a direct room, each with a short history.
// "Me" in chat is the fixture's ME (@abhi), the user GET /auth/me returns here.
const minutesBefore = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();
const chatState = (() => {
  const group = ROOMS[0]!;
  const liz = PEOPLE[1]!;
  const meUser = PEOPLE.find((p) => p.id === ME.id) ?? PEOPLE[0]!;
  const direct: Room = {
    id: "rm_direct_liz",
    type: "DIRECT",
    name: null,
    members: [meUser, liz],
    lastMessage: null,
    unreadCount: 1,
    mutedUntil: null,
  };
  const msg = (roomId: string, i: number, sender: (typeof PEOPLE)[number], content: string, mins: number): Message => ({
    id: `msg_mock_${roomId}_${i}`,
    roomId,
    sender,
    content,
    revision: 0,
    createdAt: minutesBefore(mins),
  });
  const messages = new Map<string, Message[]>([
    [
      group.id,
      [
        msg(group.id, 1, PEOPLE[3] ?? meUser, "app shell is on main, pull before you start", 95),
        msg(group.id, 2, meUser, "nice, events endpoints going up tonight", 80),
        ...(group.lastMessage ? [group.lastMessage] : []),
      ],
    ],
    [direct.id, [msg(direct.id, 1, liz, "share page is done, want to try a link?", 12)]],
  ]);
  direct.lastMessage = messages.get(direct.id)!.at(-1)!;
  return { rooms: new Map<string, Room>([[group.id, { ...group }], [direct.id, direct]]), messages, meUser };
})();

function mockReports(): Report[] {
  const reporter = PEOPLE[2] ?? PEOPLE[0]!;
  return [
    {
      id: "rep_mock_1",
      targetType: "UPTO",
      upTo: UPTOS[0]!,
      reporter,
      reason: "SPAM",
      details: "Same post three times today.",
      createdAt: NOW,
      resolvedAt: null,
    },
    {
      id: "rep_mock_2",
      targetType: "DROP",
      drop: DROPS[0]!,
      reporter: PEOPLE[0]!,
      reason: "OTHER",
      details: null,
      createdAt: new Date(Date.parse(NOW) - 3 * 3_600_000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "rep_mock_3",
      targetType: "MESSAGE",
      message: {
        id: "msg_mock_1",
        roomId: "room_mock",
        sender: PEOPLE[3] ?? PEOPLE[0]!,
        content: "Not cool, keep it civil.",
        revision: 0,
        createdAt: new Date(Date.parse(NOW) - 26 * 3_600_000).toISOString(),
      },
      reporter,
      reason: "ABOUT_A_PERSON",
      details: "Aimed at someone in the group.",
      createdAt: new Date(Date.parse(NOW) - 25 * 3_600_000).toISOString(),
      resolvedAt: new Date(Date.parse(NOW) - 20 * 3_600_000).toISOString(),
    },
  ];
}

function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}
function fail<T>(code: ErrorCode, message: string, field?: string): ApiResponse<T> {
  return { ok: false, error: field ? { code, message, field } : { code, message } };
}

/** Every schema is `.strict()` server-side; reject unknown keys here too. */
function strict(body: unknown, allowed: string[]): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Body must be an object.";
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  return extra.length ? `Unexpected field: ${extra.join(", ")}` : null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newSlug() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function newMe(fields: Partial<Me>): Me {
  return {
    id: `usr_${newSlug()}`,
    username: "newstudent",
    name: "New Student",
    avatarSeed: null,
    avatarUrl: null,
    email: null,
    phone: null,
    isVerifiedStudent: false,
    campusEmail: null,
    classOf: null,
    isAdmin: false,
    ...fields,
  };
}

/** The real server renders this; the mock only needs something plausible. */
function mockTimeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

type Body = Record<string, unknown>;

export async function mockCall<T>(key: RouteKey, path: string, raw: unknown): Promise<ApiResponse<T>> {
  await wait(350);
  const body = (raw ?? {}) as Body;
  // The mock is loosely typed internally; the envelope shape is what matters.
  const r = handle(key, path, body) as ApiResponse<T>;
  return r;
}

function handle(key: RouteKey, path: string, body: Body): ApiResponse<unknown> {
  switch (key) {
    case "signUp": {
      const bad = strict(body, ["username", "name", "email", "phone", "password", "avatarSeed"]);
      if (bad) return fail("invalid_request", bad);
      const username = String(body.username ?? "");
      if (PEOPLE.some((p) => p.username === username.toLowerCase()))
        return fail("invalid_request", "That username is taken.", "username");
      const user = newMe({
        username,
        name: String(body.name ?? ""),
        email: body.email ? String(body.email).toLowerCase() : null,
        phone: body.phone ? String(body.phone) : null,
      });
      return ok<AuthResponse>({ user });
    }

    case "signIn": {
      const bad = strict(body, ["identifier", "password"]);
      if (bad) return fail("invalid_request", bad);
      const id = String(body.identifier ?? "").toLowerCase();
      if ((id === ME.username || id === ME.email) && String(body.password ?? "").length >= 6)
        return ok<AuthResponse>({ user: { ...ME, isVerifiedStudent: false, campusEmail: null, classOf: null } });
      return fail("unauthorized", "That username or password doesn't match.");
    }

    case "sendCode": {
      const bad = strict(body, ["email"]);
      if (bad) return fail("invalid_request", bad);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^@\s+]+@scu\.edu$/.test(email))
        return fail("invalid_request", "Use your @scu.edu address, without a +tag.", "email");
      if (state.sends >= MAX_SENDS)
        return fail("rate_limited", "Too many codes requested. Try again in an hour.");
      state.sends += 1;
      state.liveCodes = Math.min(MAX_LIVE_CODES, state.liveCodes + 1); // keeps 3, drops oldest
      return ok<SendCodeResponse>({
        liveCodes: state.liveCodes,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    }

    case "confirmCode": {
      const bad = strict(body, ["email", "code", "classOf"]);
      if (bad) return fail("invalid_request", bad);
      const code = String(body.code ?? "");
      if (!/^\d{6}$/.test(code)) return fail("invalid_request", "The code is 6 digits.", "code");
      if (state.liveCodes === 0) return fail("expired", "No live code for this address.");
      if (state.attempts >= MAX_ATTEMPTS) return fail("attempts_exhausted", "No attempts left.");
      state.attempts += 1;

      if (code === MOCK_EXPIRED_CODE) return fail("expired", "That code has expired.");
      if (code !== MOCK_LIVE_CODE) {
        const left = Math.max(0, MAX_ATTEMPTS - state.attempts);
        return fail("incorrect", `That code is incorrect. ${left} ${left === 1 ? "try" : "tries"} left.`, "code");
      }
      state.attempts -= 1; // N6: a match refunds the slot

      const classOf = Number(body.classOf);
      const now = new Date();
      const min = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
      if (!Number.isInteger(classOf) || classOf < min || classOf > min + 5)
        return fail("class_of_out_of_range", `Class year must be between ${min} and ${min + 5}.`, "classOf");

      const email = String(body.email).toLowerCase();
      state.liveCodes = 0; // using one spends all of them
      if (email === ME.campusEmail) {
        return ok<ConfirmCodeResponse>({
          verified: false,
          switchToken: `swt_${newSlug()}`,
          heldBy: PEOPLE[0]!,
        });
      }
      return ok<ConfirmCodeResponse>({
        verified: true,
        user: newMe({ username: LIZ.username, name: LIZ.name, isVerifiedStudent: true, campusEmail: email, classOf }),
      });
    }

    case "switchAccount": {
      const bad = strict(body, ["switchToken", "deleteCurrent"]);
      if (bad) return fail("invalid_request", bad);
      if (!String(body.switchToken ?? "").startsWith("swt_"))
        return fail("expired", "That switch link has expired.");
      return ok<AuthResponse>({ user: ME });
    }

    case "createUpTo": {
      const bad = strict(body, ["title", "description", "scheduledAt", "location", "lat", "lng", "publish"]);
      if (bad) return fail("invalid_request", bad);
      const title = String(body.title ?? "").trim();
      if (!title) return fail("invalid_request", "Give it a title.", "title");
      const location = String(body.location ?? "").trim();
      if (!location) return fail("invalid_request", "Say where it is.", "location");
      const scheduledAt = String(body.scheduledAt ?? "");
      if (Number.isNaN(Date.parse(scheduledAt))) return fail("invalid_request", "Pick a time.", "scheduledAt");
      if (body.description != null && typeof body.description !== "string")
        return fail("invalid_request", "Description must be text.", "description");
      const description = toDescriptionField(body.description as string | null | undefined);
      if (description && codePointLength(description) > UPTO_DESCRIPTION_MAX)
        return fail("invalid_request", `Description is over ${UPTO_DESCRIPTION_MAX} characters.`, "description");

      const slug = newSlug();
      const upTo: UpTo = {
        id: `upt_${slug}`,
        creator: LIZ,
        title,
        description,
        scheduledAt,
        location,
        lat: typeof body.lat === "number" ? body.lat : null,
        lng: typeof body.lng === "number" ? body.lng : null,
        shareSlug: slug,
        shareUrl: `https://up-to.co/u/${slug}`,
        published: body.publish === true,
        goingCount: 0,
        myRsvp: null,
        poll: null,
        timeLabel: mockTimeLabel(scheduledAt),
      };
      state.createdUpTos.set(slug, upTo);
      return ok(upTo);
    }

    case "getSharedUpTo": {
      // Same rule as Abhi's getSharedUpTo: unknown and unpublished are both 404.
      const slug = decodeURIComponent(path.split("/").pop() ?? "");
      const upTo = state.createdUpTos.get(slug) ?? UPTOS.find((u) => u.shareSlug === slug);
      if (!upTo || !upTo.published) return fail("not_found", "Up-To not found");
      return ok<UpTo>(upTo);
    }

    case "pendingEvents": {
      const events = [...adminState.events.values()].filter((e) => e.reviewStatus === "PENDING");
      return ok<PendingEventsResponse>({ events, total: events.length });
    }

    case "approveEvent":
    case "rejectEvent": {
      const id = decodeURIComponent(path.split("/").at(-2) ?? "");
      const event = adminState.events.get(id);
      if (!event) return fail("not_found", "Event not found");
      if (event.reviewStatus !== "PENDING") return fail("invalid_request", "That event has already been reviewed.");
      const updated: CampusEvent = { ...event, reviewStatus: key === "approveEvent" ? "APPROVED" : "REJECTED" };
      adminState.events.set(id, updated);
      return ok<CampusEvent>(updated);
    }

    case "listReports":
      return ok<Report[]>(mockReports());

    case "me":
      return ok<AuthResponse>({ user: ME });

    case "listRooms": {
      const rooms = [...chatState.rooms.values()].sort((a, b) =>
        (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""),
      );
      return ok<Room[]>(rooms);
    }

    case "listMessages": {
      const id = decodeURIComponent(path.split("/").at(-2) ?? "");
      const room = chatState.rooms.get(id);
      if (!room) return fail("not_found", "Room not found");
      chatState.rooms.set(id, { ...room, unreadCount: 0 }); // reading marks it read
      return ok<Message[]>(chatState.messages.get(id) ?? []);
    }

    case "sendMessage": {
      const bad = strict(body, ["content"]);
      if (bad) return fail("invalid_request", bad);
      const id = decodeURIComponent(path.split("/").at(-2) ?? "");
      const room = chatState.rooms.get(id);
      if (!room) return fail("not_found", "Room not found");
      if (typeof body.content !== "string") return fail("invalid_request", "Message must be text", "content");
      const content = body.content.trim();
      if (!content) return fail("invalid_request", "Message cannot be empty", "content");
      if (content.length > 4000) return fail("invalid_request", "Message must be at most 4000 characters", "content");
      const message: Message = {
        id: `msg_mock_${newSlug()}`,
        roomId: id,
        sender: chatState.meUser,
        content,
        revision: 0,
        createdAt: new Date().toISOString(),
      };
      chatState.messages.set(id, [...(chatState.messages.get(id) ?? []), message]);
      chatState.rooms.set(id, { ...room, lastMessage: message });
      return ok<Message>(message);
    }

    default:
      return fail("server_error", `Mock has no handler for ${key} (${path}).`);
  }
}

/** Test/preview helper: put the verify mock back to a clean challenge. */
export function resetMockVerification() {
  state.sends = 0;
  state.liveCodes = 0;
  state.attempts = 0;
}
