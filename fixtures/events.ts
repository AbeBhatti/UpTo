/**
 * fixtures/events.ts — the data Home and Discover render before any API
 * exists, taken from the real app's screenshots so the rebuilt screens have
 * something truthful to lay out.
 *
 * THESE FIXTURES ARE THE API CONTRACT. Whatever shape is here is exactly what
 * `GET /events` returns: same field names, same nesting, same nulls. When the
 * backend needs something different, change `packages/contracts` and this
 * file together and tell the group — do not return a different shape and
 * leave the client to adapt.
 *
 * Reference date: Sunday 15 November 2026, 1:00 p.m. Pacific (Week 8, Fall).
 * Times are UTC on the wire; Pacific is UTC-8 on this date.
 */

import type {
  CampusEvent,
  Drop,
  Me,
  PublicUser,
  Room,
  Signup,
  UpTo,
} from "@upto/contracts";

/** The moment every relative label below was computed against. */
export const NOW = "2026-11-15T21:00:00.000Z"; // 1:00 p.m. PT

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const ME: Me = {
  id: "usr_me",
  username: "abhi",
  name: "Abhi Ala",
  avatarSeed: "abhi-01",
  avatarUrl: null,
  email: "abhi@example.com",
  phone: null,
  isVerifiedStudent: true,
  campusEmail: "aala@scu.edu",
  classOf: 2027,
  isAdmin: false,
};

export const ADMIN: Me = {
  ...ME,
  id: "usr_admin",
  username: "edrick",
  name: "Edrick Chang",
  avatarSeed: "edrick-01",
  campusEmail: "echang@scu.edu",
  isAdmin: true,
};

export const PEOPLE: PublicUser[] = [
  { id: "usr_me", username: "abhi", name: "Abhi Ala", avatarSeed: "abhi-01", avatarUrl: null },
  { id: "usr_liz", username: "liz", name: "Liz M.", avatarSeed: "liz-01", avatarUrl: null },
  { id: "usr_abe", username: "abe", name: "Abe B.", avatarSeed: "abe-01", avatarUrl: null },
  { id: "usr_admin", username: "edrick", name: "Edrick Chang", avatarSeed: "edrick-01", avatarUrl: null },
];

// ---------------------------------------------------------------------------
// Sign-up helpers
//
// The server computes `state` and `label`; the client only renders them.
// These four constants are every state the UI can be in.
// ---------------------------------------------------------------------------

const NO_SIGNUP: Signup = {
  state: "NOT_REQUIRED",
  url: null,
  opensAt: null,
  closesAt: null,
  label: null,
};

const SIGNUP_NEEDED: Signup = {
  state: "REQUIRED_UNKNOWN",
  url: "https://forms.gle/example",
  opensAt: null,
  closesAt: null,
  label: "Sign-up needed",
};

const SIGNUP_OPEN_UNTIL_NOV_20: Signup = {
  state: "OPEN",
  url: "https://forms.gle/example",
  opensAt: "2026-11-10T17:00:00.000Z",
  closesAt: "2026-11-20T08:00:00.000Z",
  label: "Sign up by Nov 20",
};

const SIGNUP_OPENS_FRI: Signup = {
  state: "OPENS_LATER",
  url: "https://forms.gle/example",
  opensAt: "2026-11-20T17:00:00.000Z",
  closesAt: null,
  label: "Sign-ups open Fri 9 AM",
};

const SIGNUP_CLOSED: Signup = {
  state: "CLOSED",
  url: "https://forms.gle/example",
  opensAt: "2026-11-01T17:00:00.000Z",
  closesAt: "2026-11-14T08:00:00.000Z",
  label: "Sign-ups closed",
};

const SCU_CALENDAR = { id: "src_livewhale", type: "LIVEWHALE", label: "SCU's events calendar" };

// ---------------------------------------------------------------------------
// Campus events
//
// Section coverage, so every branch of Home has at least one row:
//   RIGHT NOW .... 3 events, one with a hard end, one with "ends around"
//   LATER TODAY .. 2 events
//   THIS WEEK .... 6 events across Monday and Tuesday
// ---------------------------------------------------------------------------

export const EVENTS: CampusEvent[] = [
  // ----- RIGHT NOW ---------------------------------------------------------
  {
    id: "evt_pickleball",
    title: "International Education Week: Pickleball Tournament",
    description:
      "RSVP through our Google Form by Friday, November 13 to reserve your spot at the IEW Pickleball Tournament! Equipment will be provided.",
    startsAt: "2026-11-15T21:00:00.000Z", // 1:00 p.m.
    endsAt: "2026-11-15T23:30:00.000Z", // 3:30 p.m.
    location: "Pat Malley Fitness and Recreation Center",
    lat: 37.3496,
    lng: -121.9381,
    organizer: "Global Engagement",
    category: "sports",
    goingCount: 0,
    reviewStatus: "APPROVED",
    signup: SIGNUP_NEEDED,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "2 hrs left",
    isLiveNow: true,
  },
  {
    id: "evt_n8n",
    title: "n8n Buildathon at SCU",
    description: "Build automations with n8n. Laptops required.",
    startsAt: "2026-11-15T20:00:00.000Z",
    endsAt: "2026-11-16T01:00:00.000Z", // 5:00 p.m.
    location: "Bergin 116",
    lat: 37.3489,
    lng: -121.9376,
    organizer: "AI Collaborate",
    category: "career",
    goingCount: 12,
    reviewStatus: "APPROVED",
    signup: SIGNUP_NEEDED,
    source: null,
    myStatus: null,
    timeLabel: "Until 5:00 p.m.",
    isLiveNow: true,
  },
  {
    id: "evt_field_hockey",
    title: "Women's Field Hockey vs UC Davis",
    description: null,
    startsAt: "2026-11-15T20:00:00.000Z", // since 12:00
    endsAt: null, // unknown end -> "Ends around"
    location: "Bellomy Field",
    lat: 37.3515,
    lng: -121.9365,
    organizer: "Campus Recreation",
    category: "sports",
    goingCount: 31,
    reviewStatus: "APPROVED",
    signup: NO_SIGNUP,
    source: SCU_CALENDAR,
    myStatus: "GOING",
    timeLabel: "Ends around 2:00 p.m.",
    isLiveNow: true,
  },

  // ----- LATER TODAY -------------------------------------------------------
  {
    id: "evt_pump",
    title: "Pump Strength",
    description: null,
    startsAt: "2026-11-16T00:00:00.000Z", // 4:00 p.m.
    endsAt: "2026-11-16T01:00:00.000Z",
    location: "Malley Center Multipurpose Room",
    lat: 37.3496,
    lng: -121.9381,
    organizer: "Campus Recreation",
    category: "sports",
    goingCount: 4,
    reviewStatus: "APPROVED",
    signup: NO_SIGNUP,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "4:00 p.m.",
    isLiveNow: false,
  },
  {
    id: "evt_mass",
    title: "Mass of Remembrance: UCA Salvadoran Martyrs",
    description: null,
    startsAt: "2026-11-16T04:00:00.000Z", // 8:00 p.m.
    endsAt: null,
    location: "Mission Church",
    lat: 37.3493,
    lng: -121.9397,
    organizer: "Mission and Ministry",
    category: "reslife",
    goingCount: 8,
    reviewStatus: "APPROVED",
    signup: SIGNUP_NEEDED,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "8:00 p.m.",
    isLiveNow: false,
  },

  // ----- THIS WEEK ---------------------------------------------------------
  {
    id: "evt_prague",
    title: "Prague and Krakow: Global Jewish Identities and Perspectives - Info Session",
    description: null,
    startsAt: "2026-11-16T19:00:00.000Z", // Mon 11:00 a.m.
    endsAt: "2026-11-16T20:00:00.000Z",
    location: "Varsi Hall, Global Engagement Office",
    lat: 37.3486,
    lng: -121.9392,
    organizer: "Global Engagement",
    category: "trips",
    goingCount: 2,
    reviewStatus: "APPROVED",
    signup: SIGNUP_OPEN_UNTIL_NOV_20,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "Tomorrow 11:00 a.m.",
    isLiveNow: false,
  },
  {
    id: "evt_resume",
    title: "Week 9- Resume Refresh (All Students)",
    description: null,
    startsAt: "2026-11-16T19:30:00.000Z", // Mon 11:30 a.m.
    endsAt: "2026-11-16T21:00:00.000Z",
    location: "Benson Indoor Plaza",
    lat: 37.3487,
    lng: -121.9385,
    organizer: "Career Center",
    category: "career",
    goingCount: 17,
    reviewStatus: "APPROVED",
    signup: NO_SIGNUP,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "Tomorrow 11:30 a.m.",
    isLiveNow: false,
  },
  {
    id: "evt_cpt",
    title: "CPT Workshop",
    description: null,
    startsAt: "2026-11-16T20:00:00.000Z", // Mon 12:00 p.m.
    endsAt: "2026-11-16T21:00:00.000Z",
    location: "Varsi Hall, Global Engagement Office",
    lat: 37.3486,
    lng: -121.9392,
    organizer: "Global Engagement",
    category: "career",
    goingCount: 5,
    reviewStatus: "APPROVED",
    signup: NO_SIGNUP,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "Tomorrow 12:00 p.m.",
    isLiveNow: false,
  },
  {
    id: "evt_stem",
    title: "Week 9 Drop In STEM Career Advice Support Hour",
    description: null,
    startsAt: "2026-11-16T20:00:00.000Z",
    endsAt: "2026-11-16T21:00:00.000Z",
    location: "Heafy Atrium",
    lat: 37.3498,
    lng: -121.9389,
    organizer: "Career Center",
    category: "career",
    goingCount: 3,
    reviewStatus: "APPROVED",
    signup: NO_SIGNUP,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "Tomorrow 12:00 p.m.",
    isLiveNow: false,
  },
  {
    id: "evt_archives",
    title:
      "Digital Archives, Liminality & Voice: Rethinking Public Scholarship through Digital Art, Performance and Pedagogy",
    description: null,
    startsAt: "2026-11-16T21:00:00.000Z", // Mon 1:00 p.m.
    endsAt: "2026-11-16T22:30:00.000Z",
    location: "St.Clare Room, Learning Commons",
    lat: 37.3499,
    lng: -121.9368,
    organizer: "Library",
    category: "speakers",
    goingCount: 1,
    reviewStatus: "APPROVED",
    signup: SIGNUP_OPENS_FRI,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "Tomorrow 1:00 p.m.",
    isLiveNow: false,
  },
  {
    id: "evt_bigsur",
    title: "Beginner Big Sur Car Camping",
    description: "Two nights at Big Sur. Gear provided. Meet at the Bronco Statue.",
    startsAt: "2026-11-21T16:30:00.000Z", // Sat 8:30 a.m.
    endsAt: "2026-11-22T22:00:00.000Z",
    location: "Bronco Statue",
    lat: 37.3491,
    lng: -121.9382,
    organizer: "SCU Into the Wild",
    category: "trips",
    goingCount: 24,
    reviewStatus: "APPROVED",
    signup: SIGNUP_CLOSED,
    source: SCU_CALENDAR,
    myStatus: null,
    timeLabel: "Sat 8:30 a.m.",
    isLiveNow: false,
  },

  // ----- PENDING, for the admin console ------------------------------------
  {
    id: "evt_pending_1",
    title: "Thanksgiving Potluck",
    description: "Bring a dish. Imported from a flyer.",
    startsAt: "2026-11-24T01:00:00.000Z",
    endsAt: "2026-11-24T03:00:00.000Z",
    location: "Graham Commons",
    lat: 37.3503,
    lng: -121.9372,
    organizer: null,
    category: "food",
    goingCount: 0,
    reviewStatus: "PENDING",
    signup: NO_SIGNUP,
    source: { id: "src_flyer", type: "FLYER", label: "Flyer upload" },
    myStatus: null,
    timeLabel: "Nov 23, 5:00 p.m.",
    isLiveNow: false,
  },
];

/** Discover's SHOW ME counts, matching screenshot 2's rail. */
export const EVENT_COUNTS = {
  all: 251,
  free_food: 23,
  clubs: 135,
  active: 60,
  career: 33,
};

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------

export const DROPS: Drop[] = [
  {
    id: "drp_benson",
    author: PEOPLE[1],
    category: "FREE_FOOD",
    text: "Leftover pizza in Benson, second floor 🍕",
    lat: 37.3487,
    lng: -121.9385,
    expiresAt: "2026-11-15T22:30:00.000Z",
    isActive: true,
    hereCount: 7,
    goneCount: 1,
    myVote: null,
  },
  {
    id: "drp_expired",
    author: PEOPLE[2],
    category: "POP_UP",
    text: "Boba stand outside the library",
    lat: 37.3499,
    lng: -121.9368,
    expiresAt: "2026-11-15T19:00:00.000Z",
    isActive: false,
    hereCount: 3,
    goneCount: 4,
    myVote: "GONE",
  },
];

// ---------------------------------------------------------------------------
// UpTo, with a poll
// ---------------------------------------------------------------------------

export const UPTOS: UpTo[] = [
  {
    id: "upt_studysesh",
    creator: PEOPLE[1],
    title: "CSEN 174 study session",
    description: "Going over the regression testing lab. Bring your laptop.",
    scheduledAt: "2026-11-17T02:00:00.000Z",
    location: "Learning Commons, 3rd floor",
    lat: 37.3499,
    lng: -121.9368,
    shareSlug: "k3f9qz",
    shareUrl: "https://up-to.co/u/k3f9qz",
    published: true,
    goingCount: 3,
    myRsvp: null,
    timeLabel: "Tomorrow 6:00 p.m.",
    poll: {
      id: "pol_1",
      question: "What time works for everyone?",
      slots: [
        { id: "slt_1", label: "6:00 p.m.", order: 0, availableCount: 3, myResponse: null },
        { id: "slt_2", label: "7:30 p.m.", order: 1, availableCount: 1, myResponse: null },
        { id: "slt_3", label: "9:00 p.m.", order: 2, availableCount: 0, myResponse: null },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const ROOMS: Room[] = [
  {
    id: "rm_group",
    type: "GROUP",
    name: "CSEN 174 Team",
    members: PEOPLE,
    lastMessage: {
      id: "msg_3",
      roomId: "rm_group",
      sender: PEOPLE[2],
      content: "pushed the validators, 52/52 green",
      revision: 0,
      createdAt: "2026-11-15T20:41:00.000Z",
    },
    unreadCount: 2,
    mutedUntil: null,
  },
];

// ---------------------------------------------------------------------------
// The "On campus" rail — static, seeded, not backed by anything live.
// Reproduced because it is a large part of how Home reads.
// ---------------------------------------------------------------------------

export const CAMPUS_RAIL = [
  { key: "dining", title: "Dining", subtitle: "What's open right now", status: "4 open" },
  { key: "gym", title: "Malley Center", subtitle: "Courts and weight room", status: "Open" },
  { key: "athletics", title: "Athletics", subtitle: "SCU games and meets", status: "Tue" },
  { key: "safety", title: "Campus Safety", subtitle: "SCU alerts and emergency info", status: null },
] as const;
