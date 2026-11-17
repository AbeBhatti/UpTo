import type { CampusEvent } from '@upto/contracts';

/** Santa Clara University, the map's opening view. */
export const CAMPUS_CENTER = { lat: 37.3496, lng: -121.9390 };
export const CAMPUS_ZOOM = 16;

/** Events at one place: one pin on the map. */
export interface PinGroup {
  key: string;
  lat: number;
  lng: number;
  events: CampusEvent[];
}

/** Events with coordinates, grouped by place (about 10 m), soonest first within a place. */
export function groupByPlace(events: CampusEvent[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const event of events) {
    if (event.lat === null || event.lng === null) continue;
    const key = `${event.lat.toFixed(4)},${event.lng.toFixed(4)}`;
    const group = groups.get(key) ?? { key, lat: event.lat, lng: event.lng, events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.events.sort((a, b) => Number(b.isLiveNow) - Number(a.isLiveNow) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }
  return [...groups.values()];
}

/** Case-insensitive match on title, place and organizer. */
export function matchesSearch(event: CampusEvent, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [event.title, event.location, event.organizer ?? ''].some((text) => text.toLowerCase().includes(needle));
}

export function directionsUrl(event: CampusEvent): string {
  const destination = event.lat !== null && event.lng !== null
    ? `${event.lat},${event.lng}`
    : `${event.location} Santa Clara University`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
