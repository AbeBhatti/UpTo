import type { CategoryKey, EventWindow, ListEventsQuery } from "@upto/contracts";
import { campusDay, campusMidnight } from "./computed.js";

/**
 * The windows behind Home's sections and Discover's WHEN rail, as Prisma
 * where-clauses. now, today and week are disjoint, so each Home section is one
 * call and no event shows twice:
 *
 *   now      live: started, and not ended or no end time (same rule as isLiveNow)
 *   today    starts later today, Pacific
 *   week     starts tomorrow through six days out, the same range timeLabel
 *            names by weekday
 *   quarter  starts after the week, within ROLLING_QUARTER_DAYS of today
 *   past     has ended
 *   (none)   live or upcoming: everything not past
 */

/**
 * A rolling stand-in for "this quarter". There is no academic calendar in the
 * system yet; replace this with the real quarter end when there is one.
 */
export const ROLLING_QUARTER_DAYS = 70;

type Filter = Record<string, unknown>;
type Order = Record<string, "asc" | "desc">;

const notEnded = (now: Date): Filter => ({ OR: [{ endsAt: null }, { endsAt: { gt: now } }] });

export function windowWhere(when: EventWindow | undefined, now: Date): Filter {
  const today = campusDay(now);
  const tomorrow = campusMidnight(today + 1);
  switch (when) {
    case "now":
      return { AND: [{ startsAt: { lte: now } }, notEnded(now)] };
    case "today":
      return { startsAt: { gt: now, lt: tomorrow } };
    case "week":
      return { startsAt: { gte: tomorrow, lt: campusMidnight(today + 7) } };
    case "quarter":
      return { startsAt: { gte: campusMidnight(today + 7), lt: campusMidnight(today + ROLLING_QUARTER_DAYS) } };
    case "past":
      return { endsAt: { lte: now } };
    case undefined:
      return notEnded(now);
  }
}

/** Live events by soonest end, so the one about to finish is on top; past events newest first. */
export function windowOrder(when: EventWindow | undefined): Order[] {
  if (when === "now") return [{ endsAt: "asc" }, { startsAt: "asc" }, { id: "asc" }];
  if (when === "past") return [{ startsAt: "desc" }, { id: "desc" }];
  return [{ startsAt: "asc" }, { id: "asc" }];
}

/** Discover's SHOW ME rail, as categories. `all` is no filter. */
export const SHOW_ME: Record<NonNullable<ListEventsQuery["filter"]>, CategoryKey | null> = {
  all: null,
  free_food: "food",
  clubs: "clubs",
  active: "sports",
  career: "career",
};
