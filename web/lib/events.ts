import type { ApiResponse, CampusEvent, ListEventsResponse } from "@upto/contracts";
import { CAMPUS_RAIL, EVENTS, NOW } from "@upto/fixtures";

export interface HomeData {
  events: CampusEvent[];
  now: string;
  campusRail: typeof CAMPUS_RAIL;
}

/**
 * Load the event data Home needs. Fixture mode is the default and deliberately
 * makes no request, so its server-computed labels stay paired with fixture NOW.
 */
export async function getHomeData(): Promise<HomeData> {
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

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/events`, {
    method: "GET",
    credentials: "include",
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
