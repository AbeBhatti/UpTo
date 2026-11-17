'use client';

import type { CampusEvent } from '@upto/contracts';
import { useMemo, useState } from 'react';
import { DetailPane, EventRow } from '@/components';
import { MapCanvas } from './MapCanvas';
import { directionsUrl, groupByPlace, matchesSearch, type PinGroup } from './pins';
import styles from './map.module.css';

function detailDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date(value));
}

/** "1 event", "6 events". */
function eventCount(count: number) {
  return `${count} ${count === 1 ? 'event' : 'events'}`;
}

/**
 * The Map screen: a search panel ("On the map") beside the campus map.
 * A pin or a row opens the event in the panel, with Join and Directions.
 * A pin with several events lists that place's events first.
 */
export function MapView({ events, error }: { events: CampusEvent[]; error: string }) {
  const [search, setSearch] = useState('');
  const [placeKey, setPlaceKey] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  const matching = useMemo(() => events.filter((event) => matchesSearch(event, search)), [events, search]);
  const groups = useMemo(() => groupByPlace(matching), [matching]);
  const place = groups.find((group) => group.key === placeKey) ?? null;
  const selected = events.find((event) => event.id === eventId) ?? null;
  const listed = place ? place.events : matching;
  const unplaced = matching.filter((event) => event.lat === null || event.lng === null).length;

  const keyOf = (event: CampusEvent) => groups.find((group) => group.events.includes(event))?.key ?? null;

  function chooseGroup(group: PinGroup) {
    if (group.events.length === 1) {
      setPlaceKey(group.key);
      setEventId(group.events[0].id);
    } else {
      setPlaceKey(group.key);
      setEventId(null);
    }
  }

  function chooseEvent(event: CampusEvent) {
    setEventId(event.id);
    const key = keyOf(event);
    if (key) setPlaceKey(key);
  }

  function back() {
    // From an event at a busy place, back to that place's list; otherwise to everything.
    if (selected && place && place.events.length > 1) setEventId(null);
    else {
      setEventId(null);
      setPlaceKey(null);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Search the map">
        {selected ? (
          <>
          <button className={styles.back} type="button" onClick={back}>
            ‹ {place && place.events.length > 1 ? `At ${place.events[0].location}` : 'All events'}
          </button>
          <DetailPane
            event={selected}
            live={selected.isLiveNow}
            dateLabel={detailDate(selected.startsAt)}
            timeRange={selected.timeLabel}
            sourceLabel={selected.source?.label ?? ''}
            directionsUrl={directionsUrl(selected)}
            description={selected.description ?? ''}
            goingCount={selected.goingCount}
            onSignup={selected.signup.url ? () => window.open(selected.signup.url!, '_blank', 'noopener,noreferrer') : undefined}
          />
          </>
        ) : (
          <>
            <h1 className={styles.heading}>Search the map</h1>
            <input
              className={styles.search}
              type="search"
              placeholder="Search"
              aria-label="Search events on the map"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPlaceKey(null);
              }}
            />
            <div className={styles.listHeader}>
              <p className={styles.sectionLabel}>{place ? `At ${place.events[0].location}` : 'On the map'}</p>
              {place ? (
                <button className={styles.showAll} type="button" onClick={() => setPlaceKey(null)}>Show all</button>
              ) : (
                <span className={styles.count}>{eventCount(matching.length)}</span>
              )}
            </div>
            {error ? (
              <p className={styles.notice} role="alert">{error}</p>
            ) : listed.length === 0 ? (
              <p className={styles.notice}>{search ? 'Nothing matched.' : 'No upcoming events.'}</p>
            ) : (
              <div className={styles.list}>
                {listed.map((event) => (
                  <EventRow key={event.id} event={event} onSelect={() => chooseEvent(event)} />
                ))}
              </div>
            )}
            {!place && unplaced > 0 ? (
              <p className={styles.footnote}>{eventCount(unplaced)} without a place on the map.</p>
            ) : null}
          </>
        )}
      </section>
      <MapCanvas groups={groups} selectedKey={placeKey} onSelectGroup={chooseGroup} />
    </div>
  );
}
