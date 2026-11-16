import type { ApiResponse, CampusEvent, ListEventsQuery, ListEventsResponse } from "@upto/contracts";
import { CAMPUS_RAIL, EVENTS, EVENT_COUNTS, NOW } from "@upto/fixtures";

/** Home's three sections, each exactly one of the server's event windows. */
export interface HomeData {
  rightNow: CampusEvent[];
  laterToday: CampusEvent[];
  thisWeek: CampusEvent[];
  now: string;
  campusRail: typeof CAMPUS_RAIL;
}

export interface DiscoverData {
  events: CampusEvent[];
  now: string;
  counts: Record<string, number>;
  nextCursor: string | null;
}

export interface DiscoverQuery extends ListEventsQuery {
  /** Absent means everything live or upcoming: the API's GET /events with no when. */
  when?: ListEventsQuery["when"];
  filter: NonNullable<ListEventsQuery["filter"]>;
}

export interface DiscoverRequestOptions {
  cursor?: string | null;
  cookie?: string;
}

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const DAY_MS = 24 * 60 * 60 * 1000;

function pacificDateKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayOrdinal(value: string): number {
  return Date.parse(`${pacificDateKey(value)}T00:00:00Z`) / DAY_MS;
}

function isInFixtureWindow(event: CampusEvent, when: ListEventsQuery["when"], now: string): boolean {
  const nowTime = Date.parse(now);
  const startsAt = Date.parse(event.startsAt);
  // The server says whether an event is on (isLiveNow); an event with no
  // stated end is never "ended at its start" — the field hockey game with
  // "Ends around 2:00 p.m." is live. Only a stated end in the past ends one.
  const ended = !event.isLiveNow && (event.endsAt ? Date.parse(event.endsAt) : startsAt) < nowTime;

  if (when === "past") return ended;
  if (when === "now") return event.isLiveNow;
  if (ended) return false;
  if (when === "today") return pacificDateKey(event.startsAt) === pacificDateKey(now);
  if (when === "week") {
    const currentDay = dayOrdinal(now);
    const startWeek = currentDay - new Date(`${pacificDateKey(now)}T12:00:00Z`).getUTCDay();
    return dayOrdinal(event.startsAt) >= startWeek && dayOrdinal(event.startsAt) < startWeek + 7;
  }
  // The fixture set covers one quarter, so its upcoming events are the quarter view.
  return true;
}

function matchesFixtureFilter(event: CampusEvent, filter: ListEventsQuery["filter"]): boolean {
  if (!filter || filter === "all") return true;
  // SHOW ME maps onto the event model's category values: free_food -> food,
  // clubs -> clubs, active -> sports, and career -> career.
  const categoryByFilter = {
    free_food: "food",
    clubs: "clubs",
    active: "sports",
    career: "career",
  } as const;
  return event.category === categoryByFilter[filter];
}

/**
 * Load Discover's list and filter counts. Fixture mode intentionally makes no
 * request and keeps all time calculations paired with the fixture clock.
 */
export async function getDiscoverData(
  query: DiscoverQuery,
  options: DiscoverRequestOptions = {},
): Promise<DiscoverData> {
  if (process.env.NEXT_PUBLIC_USE_FIXTURES === "true") {
    const events = EVENTS.filter((event) => event.reviewStatus === "APPROVED")
      .filter((event) => isInFixtureWindow(event, query.when, NOW))
      .filter((event) => matchesFixtureFilter(event, query.filter));
    return {
      events,
      now: NOW,
      counts: EVENT_COUNTS,
      nextCursor: null,
    };
  }

  const data = await fetchEvents(query, options);
  return {
    events: data.events,
    now: new Date().toISOString(),
    counts: data.counts,
    nextCursor: data.nextCursor,
  };
}

/**
 * GET /events from the real API, forwarding the viewer's session cookie so
 * myStatus is theirs. Shared by Discover and Home.
 */
async function fetchEvents(query: ListEventsQuery, options: DiscoverRequestOptions = {}): Promise<ListEventsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required when fixtures are disabled.");
  }

  const params = new URLSearchParams();
  if (query.when) params.set("when", query.when);
  if (query.filter) params.set("filter", query.filter);
  params.set("limit", String(Math.min(query.limit ?? 50, 100)));
  if (options.cursor) params.set("cursor", options.cursor);
  const suffix = params.size ? `?${params.toString()}` : "";
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/events${suffix}`, {
    method: "GET",
    credentials: "include",
    ...(options.cookie ? { headers: { cookie: options.cookie } } : {}),
  });

  const result = (await response.json()) as ApiResponse<ListEventsResponse>;
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  if (!response.ok) {
    throw new Error(`Could not load events: API returned HTTP ${response.status}.`);
  }
  return result.data;
}

/**
 * The fixture events split the way the server's windows split them (see
 * backend/src/services/events/windows.ts), so fixture mode and the real API
 * put the same event in the same section:
 *
 *   now    live (isLiveNow, which the server computed), soonest end first
 *   today  not live, starting later today, Pacific
 *   week   starting tomorrow through six days out
 */
function fixtureSections(events: CampusEvent[], now: string) {
  const approved = events.filter((event) => event.reviewStatus === "APPROVED");
  const byStart = (a: CampusEvent, b: CampusEvent) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id);
  const byEnd = (a: CampusEvent, b: CampusEvent) =>
    (a.endsAt === null ? Infinity : Date.parse(a.endsAt)) - (b.endsAt === null ? Infinity : Date.parse(b.endsAt)) || byStart(a, b);
  const daysAhead = (event: CampusEvent) => dayOrdinal(event.startsAt) - dayOrdinal(now);
  return {
    rightNow: approved.filter((event) => event.isLiveNow).sort(byEnd),
    laterToday: approved
      .filter((event) => !event.isLiveNow && daysAhead(event) === 0 && Date.parse(event.startsAt) > Date.parse(now))
      .sort(byStart),
    thisWeek: approved.filter((event) => daysAhead(event) >= 1 && daysAhead(event) <= 6).sort(byStart),
  };
}

/**
 * Load Home's three sections. Fixture mode is the default and deliberately
 * makes no request, so its server-computed labels stay paired with fixture
 * NOW. With the real API each section is the server's own window, the same
 * ones Discover's WHEN rail uses, so the two pages always agree.
 */
export async function getHomeData(options: { cookie?: string } = {}): Promise<HomeData> {
  if (process.env.NEXT_PUBLIC_USE_FIXTURES !== "false") {
    return { ...fixtureSections(EVENTS, NOW), now: NOW, campusRail: CAMPUS_RAIL };
  }

  const [rightNow, laterToday, thisWeek] = await Promise.all(
    (["now", "today", "week"] as const).map((when) => fetchEvents({ when, limit: 100 }, options)),
  );
  return {
    rightNow: rightNow.events,
    laterToday: laterToday.events,
    thisWeek: thisWeek.events,
    now: new Date().toISOString(),
    campusRail: CAMPUS_RAIL,
  };
}
