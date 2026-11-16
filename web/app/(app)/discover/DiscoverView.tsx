'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CampusEvent, EventWindow, ListEventsQuery } from '@upto/contracts';
import { DetailPane, EventRow, SectionHeader } from '@/components';
import styles from './discover.module.css';

type ShowFilter = NonNullable<ListEventsQuery['filter']>;

interface DiscoverViewProps {
  events: CampusEvent[];
  now: string;
  counts: Record<string, number>;
  when: EventWindow;
  filter: ShowFilter;
  initialEventId: string;
}

const WINDOW_OPTIONS: { value: EventWindow; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'past', label: 'Past' },
];

// The SHOW ME rail is the contract's ListEventsQuery.filter, Clubs included:
// it filters events by their category. Club pages and following are what
// this week's scope leaves out, not this filter.
const SHOW_OPTIONS: { value: ShowFilter; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'free_food', label: 'Free food' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'active', label: 'Active' },
  { value: 'career', label: 'Career' },
];

const CATEGORY_ACCENT: Record<string, string> = {
  food: 'var(--up-cat-food-accent)',
  clubs: 'var(--up-cat-clubs-accent)',
  trips: 'var(--up-cat-trips-accent)',
  tabling: 'var(--up-cat-tabling-accent)',
  career: 'var(--up-cat-career-accent)',
  study: 'var(--up-cat-study-accent)',
  reslife: 'var(--up-cat-reslife-accent)',
  sports: 'var(--up-cat-sports-accent)',
  volunteer: 'var(--up-cat-volunteer-accent)',
  speakers: 'var(--up-cat-speakers-accent)',
  invite: 'var(--up-cat-invite-accent)',
};

function dateKey(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayOrdinal(value: string) {
  return Date.parse(`${dateKey(value)}T00:00:00Z`) / 86400000;
}

function campusDay(value: string, now: string) {
  const offset = dayOrdinal(value) - dayOrdinal(now);
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' }).format(date);
  if (offset === 0) return { lead: 'Today', weekday, key: dateKey(value) };
  if (offset === 1) return { lead: 'Tomorrow', weekday, key: dateKey(value) };
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric',
  }).format(date);
  return { lead: label, weekday: '', key: dateKey(value) };
}

function displayTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value)).replace(' AM', ' a.m.').replace(' PM', ' p.m.');
}

function detailDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date(value));
}

function timeRange(event: CampusEvent) {
  const start = displayTime(event.startsAt);
  return event.endsAt ? `${start} to ${displayTime(event.endsAt)}` : start;
}

function queryHref(when: EventWindow, filter: ShowFilter, eventId?: string) {
  const query = new URLSearchParams({ when, show: filter });
  if (eventId) query.set('event', eventId);
  return `/discover?${query.toString()}`;
}

export function DiscoverView({ events, now, counts, when, filter, initialEventId }: DiscoverViewProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialEventId);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const selectedEvent = events.find((event) => event.id === selectedId) ?? events[0];

  useEffect(() => setSelectedId(initialEventId), [initialEventId]);
  useEffect(() => {
    const currentEvent = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('event');
    if (initialEventId && currentEvent !== initialEventId) {
      router.replace(queryHref(when, filter, initialEventId), { scroll: false });
    }
  }, [filter, initialEventId, router, when]);

  const groups = useMemo(() => {
    const sorted = [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const byDay = new Map<string, { lead: string; weekday: string; events: CampusEvent[] }>();
    for (const event of sorted) {
      const day = campusDay(event.startsAt, now);
      const group = byDay.get(day.key) ?? { lead: day.lead, weekday: day.weekday, events: [] };
      group.events.push(event);
      byDay.set(day.key, group);
    }
    return [...byDay.values()];
  }, [events, now]);

  function chooseEvent(event: CampusEvent) {
    setSelectedId(event.id);
    setMobileDetailOpen(true);
    router.push(queryHref(when, filter, event.id), { scroll: false });
  }

  function changeFilters(nextWhen: EventWindow, nextFilter: ShowFilter) {
    setMobileDetailOpen(false);
    router.push(queryHref(nextWhen, nextFilter), { scroll: false });
  }

  function backToList() {
    setMobileDetailOpen(false);
    router.replace(queryHref(when, filter, selectedEvent?.id), { scroll: false });
  }

  const summary = `${WINDOW_OPTIONS.find((item) => item.value === when)?.label ?? 'This quarter'} · ${events.length} events`;

  return (
    <div className={`${styles.page} ${mobileDetailOpen ? styles.detailOpen : ''}`}>
      <aside className={styles.filters} aria-label="Discover filters">
        <fieldset className={styles.filterGroup}>
          <legend>When</legend>
          <div className={styles.filterOptions}>
            {WINDOW_OPTIONS.map((option) => (
              <label className={styles.filterOption} key={option.value}>
                <input
                  type="radio"
                  name="when"
                  value={option.value}
                  checked={when === option.value}
                  onChange={() => changeFilters(option.value, filter)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.filterGroup}>
          <legend>Show me</legend>
          <div className={styles.filterOptions}>
            {SHOW_OPTIONS.map((option) => (
              <label className={styles.filterOption} key={option.value}>
                <input
                  type="radio"
                  name="show"
                  value={option.value}
                  checked={filter === option.value}
                  onChange={() => changeFilters(when, option.value)}
                />
                <span>{option.label}</span>
                <span className={styles.count}>{counts[option.value] ?? 0} events</span>
              </label>
            ))}
          </div>
        </fieldset>
      </aside>

      <main className={styles.listColumn}>
        <header className={styles.listHeader}>
          <SectionHeader title="Discover" />
          <p className={styles.summary}>{summary}</p>
        </header>
        {events.length ? (
          <div className={styles.groups}>
            {groups.map((group) => (
              <section className={styles.dayGroup} key={group.events[0]?.startsAt}>
                <div className={styles.dayHeader}>
                  <div className={styles.dayTitle}>
                    <span>{group.lead}</span>
                    {group.weekday ? <span className={styles.weekday}>{group.weekday}</span> : null}
                  </div>
                  <span className={styles.dayCount}>{group.events.length} events</span>
                </div>
                <div className={styles.eventList}>
                  {group.events.map((event) => {
                    const organizerLine = event.organizer ?? event.source?.label ?? 'Campus event';
                    const accent = event.category ? CATEGORY_ACCENT[event.category] : undefined;
                    return (
                      <EventRow
                        key={event.id}
                        event={event}
                        live={event.isLiveNow}
                        selected={selectedEvent?.id === event.id}
                        organizerLine={organizerLine}
                        signupText={event.signup.state === 'NOT_REQUIRED' ? '' : event.signup.label ?? ''}
                        organizerStyle={accent ? { color: accent } : undefined}
                        onSelect={() => chooseEvent(event)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No events in this view.</p>
        )}
      </main>

      {selectedEvent ? (
        <div className={`${styles.detailColumn} ${mobileDetailOpen ? styles.detailColumnOpen : ''}`}>
          <DetailPane
            event={selectedEvent}
            live={selectedEvent.isLiveNow}
            dateLabel={detailDate(selectedEvent.startsAt)}
            timeRange={timeRange(selectedEvent)}
            sourceLabel={selectedEvent.source?.label ?? ''}
            description={selectedEvent.description ?? ''}
            goingCount={selectedEvent.goingCount}
            onSignup={selectedEvent.signup.url ? () => window.open(selectedEvent.signup.url!, '_blank', 'noopener,noreferrer') : undefined}
            onBack={mobileDetailOpen ? backToList : undefined}
            mobile={mobileDetailOpen}
          />
        </div>
      ) : null}
    </div>
  );
}
