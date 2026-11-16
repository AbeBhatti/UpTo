import type { AttendanceStatus, CampusEvent, CategoryKey } from "@upto/contracts";
import { isLiveNow, signupFor, timeLabel } from "./computed.js";
import type { EventWithDetails } from "./db.js";

/**
 * Presents a CampusEvent exactly as packages/contracts declares it, for one
 * viewer at one instant. The three computed fields come from computed.ts and
 * nowhere else.
 */
export function toCampusEvent(event: EventWithDetails, now: Date): CampusEvent {
  const mine = event.attendances[0];
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
    location: event.location,
    lat: event.lat,
    lng: event.lng,
    organizer: event.organizer,
    category: event.category as CategoryKey | null,
    goingCount: event.goingCount,
    reviewStatus: event.reviewStatus,
    signup: signupFor(event, now),
    source: event.source ? { id: event.source.id, type: event.source.type, label: event.source.label } : null,
    myStatus: mine ? (mine.status as AttendanceStatus) : null,
    timeLabel: timeLabel(event, now),
    isLiveNow: isLiveNow(event, now),
  };
}
