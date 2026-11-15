/**
 * @upto/contracts — the single source of truth for every shape crossing the
 * network.
 *
 * FROZEN FILE. Edrick owns it; changes are announced in the group chat and
 * merged to main the same hour. If the backend wants to return something
 * different from what is declared here, the fix is to change this file, not
 * to return a different shape and let the client adapt.
 *
 * Rule of thumb: if the frontend renders it, it is declared here. If it is
 * declared here, the backend returns exactly that — same field names, same
 * nesting, same nulls.
 */

// ---------------------------------------------------------------------------
// Envelope — every response has this shape, with no exceptions.
// ---------------------------------------------------------------------------

export type Ok<T> = { ok: true; data: T };
export type Err = {
  ok: false;
  error: { code: ErrorCode; message: string; field?: string };
};
export type ApiResponse<T> = Ok<T> | Err;

/**
 * The verification codes come straight out of Lab 6's control flow graph and
 * must keep those exact spellings — the returns R1 through R13 are named in
 * the lab by these strings.
 */
export type ErrorCode =
  | "invalid_request" // 400
  | "unauthorized" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "campus_email_in_use" // 409  (Lab 6 R9, R12)
  | "expired" // 410  (Lab 6 R2, R4, R5, R8, R9b, R10, RS)
  | "attempts_exhausted" // 410  (Lab 6 R3)
  | "incorrect" // 422  (Lab 6 N5)
  | "class_of_out_of_range" // 422  (Lab 6 R7)
  | "rules_outdated" // 409  (drops rules agreement)
  | "rate_limited" // 429
  | "server_error"; // 500

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO 8601, always UTC, always a string on the wire. */
export type IsoDateTime = string;
export type Id = string;

export type AttendanceStatus = "GOING" | "INTERESTED" | "NOT_GOING";
export type DropCategory = "FREE_FOOD" | "POP_UP" | "RANDOM";
export type DropVoteKind = "HERE" | "GONE";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RoomType = "DIRECT" | "GROUP";
export type ReportReason =
  | "ABOUT_A_PERSON"
  | "THREAT"
  | "HATE"
  | "SEXUAL"
  | "SPAM"
  | "OTHER";

/** The design-system category keys. Drives the pin and chip colour. */
export type CategoryKey =
  | "food"
  | "clubs"
  | "trips"
  | "tabling"
  | "career"
  | "study"
  | "reslife"
  | "sports"
  | "volunteer"
  | "speakers"
  | "invite";

// ---------------------------------------------------------------------------
// Sign-up windows — a cross-client contract.
//
// The SERVER computes `state`. The client renders fixed copy per state and
// never recomputes it from the timestamps, so iOS, web and the admin console
// can never disagree about whether sign-ups are open.
// ---------------------------------------------------------------------------

export type SignupState =
  | "NOT_REQUIRED" // no sign-up at all
  | "OPENS_LATER" // -> "Sign-ups open Fri 9 AM"
  | "OPEN" // -> "Sign up by Nov 9"
  | "CLOSED" // -> "Sign-ups closed"
  | "REQUIRED_UNKNOWN"; // -> "Sign-up needed"

export interface Signup {
  state: SignupState;
  url: string | null;
  opensAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  /** Pre-rendered by the server, e.g. "Sign-ups open Fri 9 AM". */
  label: string | null;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: Id;
  username: string;
  name: string;
  avatarSeed: string | null;
  avatarUrl: string | null;
}

export interface Me extends PublicUser {
  email: string | null;
  phone: string | null;
  isVerifiedStudent: boolean;
  campusEmail: string | null;
  classOf: number | null;
  isAdmin: boolean;
}

export interface SignUpRequest {
  username: string; // 3 to 30
  name: string;
  email?: string; // email OR phone required
  phone?: string;
  password: string; // min 6
  avatarSeed?: string; // max 64
}

export interface SignInRequest {
  identifier: string; // username, email or phone
  password: string;
}

export interface GoogleSignInRequest {
  token: string; // required
  username?: string; // max 30
  avatarUrl?: string; // must parse as a URL
}

export type AuthResponse = { user: Me };

// ---------------------------------------------------------------------------
// Verification (Lab 6)
// ---------------------------------------------------------------------------

export interface SendCodeRequest {
  email: string; // must be an scu.edu address, untagged
}

export interface SendCodeResponse {
  /** How many live codes the account now holds, 1 to MAX_LIVE_CODES (3). */
  liveCodes: number;
  expiresAt: IsoDateTime;
}

export interface ConfirmCodeRequest {
  email: string;
  code: string; // exactly 6 digits
  classOf: number; // range-checked -> 422 class_of_out_of_range
}

export type ConfirmCodeResponse =
  | { verified: true; user: Me }
  /** The 409 path: another account holds the address (Lab 6 N9 -> R9). */
  | { verified: false; switchToken: string; heldBy: PublicUser };

export interface SwitchAccountRequest {
  switchToken: string;
  deleteCurrent?: boolean;
}

// ---------------------------------------------------------------------------
// Campus events
// ---------------------------------------------------------------------------

export interface CampusEvent {
  id: Id;
  title: string;
  description: string | null;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime | null;
  location: string;
  lat: number | null;
  lng: number | null;
  organizer: string | null;
  category: CategoryKey | null;
  goingCount: number;
  reviewStatus: ReviewStatus;
  signup: Signup;
  /** Null for student-posted events; set for anything imported. */
  source: { id: Id; type: string; label: string } | null;
  /** This viewer's RSVP, null if none. */
  myStatus: AttendanceStatus | null;
  /**
   * Server-rendered, because Home and Discover show the same phrasing and
   * neither client should be computing it: "2 hrs left", "Until 5:00 p.m.",
   * "Ends around 2:00 p.m.", "NOW", "Tomorrow".
   */
  timeLabel: string;
  isLiveNow: boolean;
}

/** The windows behind Home's sections and Discover's WHEN rail. */
export type EventWindow = "now" | "today" | "week" | "quarter" | "past";

export interface ListEventsQuery {
  when?: EventWindow;
  category?: CategoryKey;
  /** Discover's SHOW ME rail. */
  filter?: "all" | "free_food" | "clubs" | "active" | "career";
  limit?: number;
  cursor?: string;
}

export interface ListEventsResponse {
  events: CampusEvent[];
  /** Powers the counts beside each Discover filter. */
  counts: Record<string, number>;
  nextCursor: string | null;
}

export interface RsvpRequest {
  status: AttendanceStatus; // case-insensitive, trimmed
}

/** Max 200 ids, deduplicated, each id at most 191 characters. */
export interface RsvpSyncRequest {
  eventIds: string[];
  status: AttendanceStatus;
}

export interface RsvpSyncResponse {
  updated: number;
  skipped: string[];
}

// ---------------------------------------------------------------------------
// UpTo and Poll
// ---------------------------------------------------------------------------

export interface UpTo {
  id: Id;
  creator: PublicUser;
  title: string;
  description: string | null; // cleaned, max 2000
  scheduledAt: IsoDateTime;
  location: string;
  lat: number | null;
  lng: number | null;
  shareSlug: string;
  shareUrl: string; // the full UpTo.shareLink()
  published: boolean;
  goingCount: number;
  myRsvp: { going: true; anonymous: boolean } | null;
  poll: Poll | null;
  timeLabel: string;
}

export interface CreateUpToRequest {
  title: string;
  description?: string | null;
  scheduledAt: IsoDateTime;
  location: string;
  lat?: number;
  lng?: number;
  publish?: boolean;
}

/** Lab 5: "GOING with anonymity accepted; MAYBE or a string 'true' rejected". */
export interface UpToRsvpRequest {
  status: "GOING";
  anonymous?: boolean;
}

export interface Poll {
  id: Id;
  question: string; // max 280, trimmed
  slots: PollSlot[];
}

export interface PollSlot {
  id: Id;
  label: string; // max 120
  order: number; // integer >= 0
  availableCount: number;
  myResponse: boolean | null;
}

/** Lab 5: 2 to 20 slots. */
export interface CreatePollRequest {
  question: string;
  slots: Array<{ label: string; order?: number }>;
}

/** Lab 5: at least one, at most 20. */
export interface RespondPollRequest {
  responses: Array<{ slotId: Id; available: boolean }>;
}

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------

export interface Drop {
  id: Id;
  author: PublicUser;
  category: DropCategory;
  text: string; // 3 to 80 graphemes
  lat: number;
  lng: number;
  expiresAt: IsoDateTime;
  isActive: boolean;
  hereCount: number;
  goneCount: number;
  myVote: DropVoteKind | null;
}

/**
 * Lab 5: this schema is `.strict()`. A body carrying `authorId`, `createdAt`
 * or `expiresAt` is a 400, not a silently ignored key — a client sending
 * those is not the app.
 */
export interface CreateDropRequest {
  category: DropCategory;
  text: string;
  lat: number; // -90 to 90, finite
  lng: number; // -180 to 180, finite
  clientRef?: string; // 8 to 64 of [A-Za-z0-9_-]
}

/** null withdraws the vote. */
export interface VoteDropRequest {
  vote: DropVoteKind | null;
}

/** Lab 5: integer, 1 to DROPS_RULES_VERSION (2). */
export interface RulesAgreementRequest {
  rulesVersion: number;
}

// ---------------------------------------------------------------------------
// Reports — the Lab 4 abstract Report, narrowed back into its two subclasses.
//
// The database stores one row; these types are what the class diagram means.
// ---------------------------------------------------------------------------

interface ReportBase {
  id: Id;
  reporter: PublicUser;
  reason: ReportReason;
  details: string | null; // max 500
  createdAt: IsoDateTime;
  resolvedAt: IsoDateTime | null;
}

export interface DropReport extends ReportBase {
  targetType: "DROP";
  drop: Drop;
}

export interface UpToReport extends ReportBase {
  targetType: "UPTO";
  upTo: UpTo;
}

export interface MessageReport extends ReportBase {
  targetType: "MESSAGE";
  message: Message;
}

export type Report = DropReport | UpToReport | MessageReport;

export interface SubmitReportRequest {
  reason: ReportReason;
  details?: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface Room {
  id: Id;
  type: RoomType;
  name: string | null; // 1 to 80, no line breaks
  members: PublicUser[];
  lastMessage: Message | null;
  unreadCount: number;
  mutedUntil: IsoDateTime | null;
}

export interface Message {
  id: Id;
  roomId: Id;
  sender: PublicUser;
  content: string;
  revision: number; // integer 0 to 50
  createdAt: IsoDateTime;
}

export interface CreateRoomRequest {
  type: RoomType;
  name?: string;
  memberIds: Id[]; // 1 to 20
}

export interface RenameRoomRequest {
  name: string; // 1 to 80, trimmed, no line breaks
}

/**
 * Lab 5: "adding people needs exactly one list: both or neither is rejected".
 * Supply userIds OR usernames, never both and never neither. Each list is
 * 1 to 20 entries.
 */
export interface AddMembersRequest {
  userIds?: Id[];
  usernames?: string[];
}

export interface SendMessageRequest {
  content: string;
}

/** Lab 5: null unmutes, an ISO time mutes, plain words are rejected. */
export interface MuteRoomRequest {
  mutedUntil: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface PendingEventsResponse {
  events: CampusEvent[];
  total: number;
}

export interface FlyerUploadResponse {
  /** A draft the admin edits before approving. Not yet persisted as an event. */
  draft: Pick<
    CampusEvent,
    "title" | "description" | "startsAt" | "endsAt" | "location" | "category"
  >;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: Id;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// The route table, as types. Import this in both the client and the server so
// a path typo is a compile error rather than a 404 found on integration day.
// ---------------------------------------------------------------------------

export const ROUTES = {
  signUp: "POST /auth/signup",
  signIn: "POST /auth/signin",
  googleSignIn: "POST /auth/google",
  me: "GET /auth/me",
  signOut: "POST /auth/signout",

  sendCode: "POST /verify/send",
  confirmCode: "POST /verify/confirm",
  switchAccount: "POST /verify/switch",

  listEvents: "GET /events",
  getEvent: "GET /events/:id",
  rsvp: "POST /events/:id/rsvp",
  rsvpSync: "POST /events/rsvp/sync",
  listSources: "GET /sources",

  createUpTo: "POST /uptos",
  getUpTo: "GET /uptos/:id",
  getSharedUpTo: "GET /u/:slug",
  rsvpUpTo: "POST /uptos/:id/rsvp",
  reportUpTo: "POST /uptos/:id/report",
  createPoll: "POST /uptos/:id/poll",
  respondPoll: "POST /uptos/:id/poll/respond",

  listDrops: "GET /drops",
  createDrop: "POST /drops",
  voteDrop: "POST /drops/:id/vote",
  reportDrop: "POST /drops/:id/report",
  rulesAgreement: "POST /drops/rules-agreement",

  listRooms: "GET /chat/rooms",
  createRoom: "POST /chat/rooms",
  renameRoom: "PATCH /chat/rooms/:id",
  addMembers: "POST /chat/rooms/:id/members",
  listMessages: "GET /chat/rooms/:id/messages",
  sendMessage: "POST /chat/rooms/:id/messages",
  muteRoom: "POST /chat/rooms/:id/mute",
  reportMessage: "POST /chat/messages/:id/report",

  pendingEvents: "GET /admin/events/pending",
  approveEvent: "POST /admin/events/:id/approve",
  rejectEvent: "POST /admin/events/:id/reject",
  uploadFlyer: "POST /admin/flyer",
  listReports: "GET /admin/reports",

  listNotifications: "GET /notifications",
} as const;

export type RouteKey = keyof typeof ROUTES;
