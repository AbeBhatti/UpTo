import type { ApiResponse, CampusEvent, ListEventsQuery, ListEventsResponse } from "@upto/contracts";
import { CAMPUS_RAIL, EVENTS, EVENT_COUNTS, NOW } from "@upto/fixtures";

export interface HomeData {
  events: CampusEvent[];
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
  when: NonNullable<ListEventsQuery["when"]>;
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

  return {
    events: result.data.events,
    now: new Date().toISOString(),
    counts: result.data.counts,
    nextCursor: result.data.nextCursor,
  };
}

/**
 * Load the event data Home needs. Fixture mode is the default and deliberately
 * makes no request, so its server-computed labels stay paired with fixture NOW.
 */
export async function getHomeData(options: { cookie?: string } = {}): Promise<HomeData> {
  if (process.env.NEXT_PUBLIC_USE_FIXTURES !== "false") {
    return {
      events: EVENTS,
      now: NOW,
      campusRail: CAMPUS_RAIL,
    };
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required when fixtures are disabled.");
  }

  // Forward the viewer's session, as Discover does, so myStatus is theirs.
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/events`, {
    method: "GET",
    credentials: "include",
    ...(options.cookie ? { headers: { cookie: options.cookie } } : {}),
  });

  if (!response.ok) {
    throw new Error(`Could not load events: API returned HTTP ${response.status}.`);
  }

  const result = (await response.json()) as ApiResponse<ListEventsResponse>;
  if (!result.ok) {
    throw new Error(`Could not load events: ${result.error.message}`);
  }

  return {
    events: result.data.events,
    now: new Date().toISOString(),
    campusRail: CAMPUS_RAIL,
  };
}
