'use client';

import { useSyncExternalStore } from 'react';
import type { ApiResponse, AttendanceStatus, CampusEvent } from '@upto/contracts';
import { call } from '@/app/(app)/create/_shared/api';

/**
 * RSVPs: POST /events/:id/rsvp, and the server's answer shared by every
 * place that shows the same event.
 *
 * Discover shows an event twice (its list row and the detail pane) and Home
 * can too, so the server's myStatus and goingCount after an RSVP are kept
 * here, keyed by event id. Every Join button and going count reads from this
 * store first and falls back to the event it was rendered with. Nothing is
 * written until the server answers, so the screen never claims an RSVP the
 * server did not take.
 */

export interface RsvpState {
  myStatus: AttendanceStatus | null;
  goingCount: number;
}

const answers = new Map<string, RsvpState>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current RSVP state for an event: the server's last answer, else what it was rendered with. */
export function useRsvp(event: Pick<CampusEvent, 'id' | 'myStatus' | 'goingCount'>): RsvpState {
  const answer = useSyncExternalStore(
    subscribe,
    () => answers.get(event.id),
    () => undefined,
  );
  return answer ?? { myStatus: event.myStatus, goingCount: event.goingCount };
}

/** Sends the RSVP; on success records the server's answer for every view of this event. */
export async function rsvp(eventId: string, status: AttendanceStatus): Promise<ApiResponse<CampusEvent>> {
  const result = await call<CampusEvent>('rsvp', { params: { id: eventId }, body: { status } });
  if (result.ok) {
    answers.set(eventId, { myStatus: result.data.myStatus, goingCount: result.data.goingCount });
    for (const listener of listeners) listener();
  }
  return result;
}
