import type { CategoryKey } from "@upto/contracts";
import { campusDay, campusMidnight } from "../events/computed.js";
import { cleanDescription } from "../../validators/upto.validator.js";

/**
 * SCU's LiveWhale calendar (events.scu.edu) as CampusEvent columns.
 *
 * This file is pure: JSON in, rows out, no network and no database, so the
 * tests parse a captured response (fixtures/livewhale-2026-11-16.json) and a
 * LiveWhale outage can never break the build.
 *
 * The feed's shape, from that capture: { meta, links, data: [event] }, where
 * each event carries `id`, `title`, `date_utc` and `date2_utc` as
 * "YYYY-MM-DD HH:MM:SS" in UTC without a zone marker, `is_all_day`,
 * `is_canceled`, `status` (1 = live), `location_title`/`location`,
 * `location_latitude`/`location_longitude`, `group_title`, `event_types`,
 * `tags`, `has_registration`, `url`, and HTML in `description`/`summary`.
 * Text fields arrive HTML-escaped ("Arts &amp; Sciences").
 */

/** The feed this importer reads by default: up to 100 upcoming events with the fields below. */
export const LIVEWHALE_FEED_URL =
  "https://events.scu.edu/live/json/events/max/100/response_fields/location,summary,description,registration,event_types,tags,group_title,status";

/** Label for the EventSource row; the fixtures call it this. */
export const LIVEWHALE_LABEL = "SCU's events calendar";

export interface LiveWhaleEvent {
  id: number | string;
  title?: string | null;
  date_utc?: string | null;
  date2_utc?: string | null;
  is_all_day?: number | null;
  is_canceled?: number | null;
  status?: number | null;
  is_online?: number | null;
  location?: string | null;
  location_title?: string | null;
  location_latitude?: number | string | null;
  location_longitude?: number | string | null;
  group_title?: string | null;
  event_types?: string[] | null;
  tags?: string[] | null;
  has_registration?: number | null;
  url?: string | null;
  description?: string | null;
  summary?: string | null;
}

export interface LiveWhaleResponse {
  data: LiveWhaleEvent[];
}

/** What the importer writes for one event. reviewStatus is the importer's call, not the feed's. */
export interface ImportedEvent {
  externalId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  lat: number | null;
  lng: number | null;
  organizer: string | null;
  category: CategoryKey | null;
  signupUrl: string | null;
}

export interface Skipped {
  externalId: string;
  reason: "canceled" | "not live" | "incomplete";
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…",
};

/** Decodes the HTML entities LiveWhale escapes text with. Unknown names are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

/** HTML to plain text: line breaks and paragraphs kept, every tag dropped, entities decoded. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]*\n[ \t]*/g, "\n");
  return decodeEntities(text);
}

/** Cuts to `max` code points, ending in an ellipsis when it had to cut. */
function fit(text: string, max: number): string {
  const points = [...text];
  return points.length <= max ? text : `${points.slice(0, max - 1).join("").trimEnd()}…`;
}

const plain = (value: string | null | undefined) => (value ? decodeEntities(value).replace(/\s+/g, " ").trim() : "");

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** LiveWhale's "2026-11-16 18:00:00" is UTC with no zone marker. */
function utc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const coordinate = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Deliberate: LiveWhale's event types and tags mapped onto the design's
 * category keys, first match wins, null when nothing fits (the admin can set
 * one in review). The calendar has no fixed vocabulary, so this is a
 * best-effort keyword map, not a lookup table; extend it as new types show up.
 */
const CATEGORY_RULES: Array<[CategoryKey, RegExp]> = [
  ["career", /career|employer|internship|recruit|job\b/],
  ["sports", /athletic|sport|recreation|fitness|intramural/],
  ["food", /\bfood|dining|lunch|dinner|breakfast|potluck/],
  ["speakers", /lecture|speaker|talk|panel|colloquium|symposium/],
  ["trips", /\btrip|excursion|outdoor|study abroad/],
  ["volunteer", /volunteer|community service/],
  ["reslife", /\bmass\b|liturgy|worship|ministry|residen/],
  ["study", /workshop|tutor|study|office hour|advising|course/],
  ["tabling", /tabling|\bfair\b/],
  ["clubs", /\bclub|student organi[sz]ation/],
];

function categoryFor(event: LiveWhaleEvent): CategoryKey | null {
  // Types and tags only, never the title: "Gardens: For Food and Medicine" is
  // a course, not free food.
  const words = [...(event.event_types ?? []), ...(event.tags ?? [])]
    .map((word) => plain(word).toLowerCase())
    .join(" | ");
  for (const [key, pattern] of CATEGORY_RULES) if (pattern.test(words)) return key;
  return null;
}

/**
 * Deliberate: an all-day event runs until the next Pacific midnight. LiveWhale
 * gives it a start at midnight and no end, and with the 2-hour assumption for
 * events without an end it would read as over by 2:00 a.m.
 */
function endFor(event: LiveWhaleEvent, start: Date): Date | null {
  const end = utc(event.date2_utc);
  if (event.is_all_day) return campusMidnight(campusDay(end ?? start) + 1);
  return end;
}

// ---------------------------------------------------------------------------
// The parse
// ---------------------------------------------------------------------------

/** Every event in one LiveWhale response, as rows, plus what was left out and why. */
export function parseLiveWhale(response: LiveWhaleResponse): { events: ImportedEvent[]; skipped: Skipped[] } {
  const events: ImportedEvent[] = [];
  const skipped: Skipped[] = [];

  for (const raw of response.data ?? []) {
    const externalId = String(raw.id);
    if (raw.is_canceled) {
      skipped.push({ externalId, reason: "canceled" });
      continue;
    }
    if (raw.status !== undefined && raw.status !== null && raw.status !== 1) {
      skipped.push({ externalId, reason: "not live" });
      continue;
    }
    const title = plain(raw.title);
    const startsAt = utc(raw.date_utc);
    if (!title || startsAt === null) {
      skipped.push({ externalId, reason: "incomplete" });
      continue;
    }

    const body = raw.description || raw.summary;
    const description = body ? cleanDescription(htmlToText(body)) : "";
    const location = plain(raw.location_title) || plain(raw.location) || (raw.is_online ? "Online" : "Location to be announced");

    events.push({
      externalId,
      title: fit(title, 200),
      // Deliberate: a description over the 2,000-character column is cut with
      // an ellipsis rather than dropping the event; the full text is on `url`.
      description: description === "" ? null : fit(description, 2000),
      startsAt,
      endsAt: endFor(raw, startsAt),
      location: fit(location, 200),
      lat: coordinate(raw.location_latitude),
      lng: coordinate(raw.location_longitude),
      organizer: plain(raw.group_title) ? fit(plain(raw.group_title), 120) : null,
      category: categoryFor(raw),
      // Registration with no window known: signup reads "Sign-up needed".
      signupUrl: raw.has_registration && raw.url ? raw.url : null,
    });
  }
  return { events, skipped };
}
