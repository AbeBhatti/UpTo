import type { Signup } from "@upto/contracts";

/**
 * The three server-computed event fields: isLiveNow, signup and timeLabel.
 *
 * Both clients render these verbatim and never recompute them, so this file is
 * the only place in the system that decides whether sign-ups are open or how
 * long an event has left. Every function takes `now` explicitly; nothing here
 * reads the clock.
 *
 * All calendar arithmetic is in Pacific time, because "today", "tomorrow" and
 * "Fri" mean the campus's day, not UTC's. fixtures/events.ts is the oracle:
 * lab-tests/extra/eventLabels.test.ts feeds every fixture through these
 * functions at the fixture's NOW and requires the exact same strings.
 */

export const CAMPUS_TIME_ZONE = "America/Los_Angeles";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Deliberate: an event with no end time is assumed to run 2 hours, so it reads
 * "Ends around <start + 2h>". Neither the brief nor the contract states a
 * duration; it is inferred from the one fixture without an end time
 * (evt_field_hockey: starts 12:00, fixture says "Ends around 2:00 p.m."). Do
 * not change it without changing fixtures/events.ts and eventLabels.test.ts.
 */
export const ASSUMED_DURATION_MS = 2 * HOUR;
/**
 * Deliberate: a live event ending in under 3 hours counts down ("2 hrs left");
 * one ending later says "Until 5:00 p.m.". The fixtures only pin the threshold
 * between 2.5 hours (evt_pickleball counts down) and 4 hours (evt_n8n says
 * "Until"), so any value in (2.5h, 4h] passes; 3 hours is a judgment call.
 */
export const COUNTDOWN_UNDER_MS = 3 * HOUR;

// ---------------------------------------------------------------------------
// Pacific calendar helpers
// ---------------------------------------------------------------------------

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface CampusParts {
  year: number;
  month: number; // 1 to 12
  day: number;
  hour: number; // 0 to 23
  minute: number;
  weekday: string; // "Sun" .. "Sat"
}

export function campusParts(at: Date): CampusParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(at)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday!,
  };
}

/** Days since the epoch of the Pacific calendar date `at` falls on. */
export function campusDay(at: Date): number {
  const { year, month, day } = campusParts(at);
  return Math.round(Date.UTC(year, month - 1, day) / DAY);
}

/** The instant Pacific midnight begins on the given campusDay(). DST-safe. */
export function campusMidnight(dayNumber: number): Date {
  for (const offsetHours of [8, 7]) {
    const candidate = new Date(dayNumber * DAY + offsetHours * HOUR);
    if (campusDay(candidate) === dayNumber && campusParts(candidate).hour === 0) return candidate;
  }
  throw new Error(`No Pacific midnight found for day ${dayNumber}`);
}

/** "4:00 p.m.", "11:30 a.m.", "12:00 p.m." (noon), "12:00 a.m." (midnight). */
export function clockTime(at: Date): string {
  const { hour, minute } = campusParts(at);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`;
}

/** The sign-up copy's shorter style: "9 AM", "9:30 AM". */
function shortClockTime(at: Date): string {
  const { hour, minute } = campusParts(at);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`} ${hour < 12 ? "AM" : "PM"}`;
}

/** "Nov 20" */
function monthDay(at: Date): string {
  const { month, day } = campusParts(at);
  return `${MONTHS[month - 1]} ${day}`;
}

/**
 * The day part of a label, relative to now: "" for today, "Tomorrow", a
 * weekday within the next six days, otherwise a date. Seven days out is a
 * date, not a weekday, because "Sun" on a Sunday would read as today.
 */
function relativeDay(at: Date, now: Date): { kind: "today" | "tomorrow" | "weekday" | "date"; text: string } {
  const diff = campusDay(at) - campusDay(now);
  if (diff === 0) return { kind: "today", text: "" };
  if (diff === 1) return { kind: "tomorrow", text: "Tomorrow" };
  if (diff > 1 && diff < 7) return { kind: "weekday", text: campusParts(at).weekday };
  return { kind: "date", text: monthDay(at) };
}

// ---------------------------------------------------------------------------
// The three computed fields
// ---------------------------------------------------------------------------

export interface EventTimes {
  startsAt: Date;
  endsAt: Date | null;
}

/**
 * When an event is over: its endsAt, or, with no end time, startsAt plus
 * ASSUMED_DURATION_MS. The same constant produces "Ends around 2:00 p.m.", so
 * an event labelled as ending at 2:00 p.m. is not still live at 4:00 p.m. The
 * `now` and `past` windows in windows.ts use the same rule.
 */
export function effectiveEnd(event: EventTimes): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + ASSUMED_DURATION_MS);
}

/** Started, and not yet at its effective end. */
export function isLiveNow(event: EventTimes, now: Date): boolean {
  return event.startsAt.getTime() <= now.getTime() && now.getTime() < effectiveEnd(event).getTime();
}

export interface SignupFields {
  signupUrl: string | null;
  signupOpensAt: Date | null;
  signupClosesAt: Date | null;
}

/**
 * The cross-client sign-up contract.
 *
 *   no url, no dates        NOT_REQUIRED      null
 *   url, no dates           REQUIRED_UNKNOWN  "Sign-up needed"
 *   closesAt passed         CLOSED            "Sign-ups closed"
 *   opensAt in the future   OPENS_LATER       "Sign-ups open Fri 9 AM"
 *   open now, closesAt set  OPEN              "Sign up by Nov 9"
 *   open now, no closesAt   OPEN              "Sign-ups open"
 *
 * CLOSED is checked before OPENS_LATER so contradictory dates can never read
 * as still to come. A deadline is closed at its instant; an opening is open
 * at its instant.
 *
 * Deliberate, and beyond both the brief's table and the fixtures:
 * - "open now, no closesAt" has no row in the brief; it is OPEN with the label
 *   "Sign-ups open", since OPEN with a null label would render nothing.
 * - OPENS_LATER is only pinned for a weekday ("Fri 9 AM"). The other forms,
 *   "Sign-ups open 9 AM" (today), "tomorrow 9 AM" and "Nov 30, 9 AM" (a week
 *   or more out), follow timeLabel's day rules.
 */
export function signupFor(fields: SignupFields, now: Date): Signup {
  const { signupUrl: url, signupOpensAt: opensAt, signupClosesAt: closesAt } = fields;
  const base = {
    url,
    opensAt: opensAt ? opensAt.toISOString() : null,
    closesAt: closesAt ? closesAt.toISOString() : null,
  };

  if (opensAt === null && closesAt === null) {
    return url === null
      ? { state: "NOT_REQUIRED", ...base, label: null }
      : { state: "REQUIRED_UNKNOWN", ...base, label: "Sign-up needed" };
  }
  if (closesAt !== null && closesAt.getTime() <= now.getTime()) {
    return { state: "CLOSED", ...base, label: "Sign-ups closed" };
  }
  if (opensAt !== null && opensAt.getTime() > now.getTime()) {
    const day = relativeDay(opensAt, now);
    const when =
      day.kind === "today"
        ? shortClockTime(opensAt)
        : day.kind === "date"
          ? `${day.text}, ${shortClockTime(opensAt)}`
          : `${day.kind === "tomorrow" ? "tomorrow" : day.text} ${shortClockTime(opensAt)}`;
    return { state: "OPENS_LATER", ...base, label: `Sign-ups open ${when}` };
  }
  return {
    state: "OPEN",
    ...base,
    label: closesAt === null ? "Sign-ups open" : `Sign up by ${monthDay(closesAt)}`,
  };
}

/**
 * "2 hrs left", "1 hr left", "45 min left".
 *
 * Deliberate: rounded DOWN, so 2.5 hours left is "2 hrs left" (evt_pickleball
 * in the fixtures) and the label never overstates the time remaining. Rounding
 * to nearest would say "3 hrs left" and break the fixture test.
 */
function countdown(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  if (hours >= 2) return `${hours} hrs left`;
  if (hours === 1) return "1 hr left";
  return `${Math.max(1, Math.floor(ms / MINUTE))} min left`;
}

/** A start or end time with its day: "4:00 p.m.", "Tomorrow 11:00 a.m.", "Sat 8:30 a.m.", "Nov 23, 5:00 p.m.". */
function dayAndTime(at: Date, now: Date): string {
  const day = relativeDay(at, now);
  if (day.kind === "today") return clockTime(at);
  if (day.kind === "date") return `${day.text}, ${clockTime(at)}`;
  return `${day.text} ${clockTime(at)}`;
}

/**
 * The phrase Home and Discover show beside an event.
 *
 *   live, no end time              "Ends around 2:00 p.m."   (start + 2 hours)
 *   live, ends within 3 hours      "2 hrs left"
 *   live, ends later               "Until 5:00 p.m."          ("Until Sun 2:00 p.m." on another day)
 *   upcoming                       "4:00 p.m." / "Tomorrow 11:00 a.m." / "Sat 8:30 a.m." / "Nov 23, 5:00 p.m."
 *   ended                          the start, the same way, e.g. "Nov 14, 7:00 p.m."
 */
export function timeLabel(event: EventTimes, now: Date): string {
  if (isLiveNow(event, now)) {
    if (event.endsAt === null) {
      return `Ends around ${clockTime(new Date(event.startsAt.getTime() + ASSUMED_DURATION_MS))}`;
    }
    const left = event.endsAt.getTime() - now.getTime();
    if (left < COUNTDOWN_UNDER_MS) return countdown(left);
    return `Until ${dayAndTime(event.endsAt, now)}`;
  }
  return dayAndTime(event.startsAt, now);
}
