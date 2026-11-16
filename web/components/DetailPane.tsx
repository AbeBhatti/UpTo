'use client';

import type { CampusEvent } from '@upto/contracts';
import { useState } from 'react';
import { JoinButton } from './JoinButton';
import { SignupBadge } from './SignupBadge';
import styles from './DetailPane.module.css';

interface DetailPaneProps {
  event: CampusEvent;
  live?: boolean;
  dateLabel?: string;
  timeRange?: string;
  sourceLabel?: string;
  directionsUrl?: string;
  description?: string;
  goingCount?: number;
  onSignup?: () => void;
  onBack?: () => void;
  mobile?: boolean;
}

export function DetailPane({
  event,
  live,
  dateLabel,
  timeRange,
  sourceLabel,
  directionsUrl,
  description,
  goingCount,
  onSignup,
  onBack,
  mobile = false,
}: DetailPaneProps) {
  const [showMore, setShowMore] = useState(false);
  const shownDescription = description ?? event.description;
  const isDiscover = dateLabel !== undefined || timeRange !== undefined || sourceLabel !== undefined || goingCount !== undefined || onSignup !== undefined;

  return (
    <aside className={`${styles.pane} ${mobile ? styles.mobile : ''}`} aria-label={`${event.title} details`}>
      {onBack ? <button className={styles.back} type="button" onClick={onBack}>‹ Back</button> : null}
      {isDiscover ? (
        <>
          <div className={styles.hero}>
            {live ? <p className={styles.live}>HAPPENING NOW</p> : null}
            <h2 className={styles.title}>{event.title}</h2>
            <p className={styles.time}>{timeRange ?? event.timeLabel}</p>
          </div>
          <div className={styles.info}>
            {event.organizer ? <p className={styles.discoverOrganizer}>{event.organizer}</p> : null}
            {dateLabel ? <p className={styles.infoRow}>{dateLabel}</p> : null}
            <p className={styles.infoRow}>{event.location}{directionsUrl ? <a className={styles.directions} href={directionsUrl} target="_blank" rel="noopener">Directions</a> : null}</p>
            {sourceLabel ? <p className={styles.infoRow}>{sourceLabel}</p> : null}
          </div>
          {shownDescription ? (
            <div className={styles.descriptionBlock}>
              <p className={`${styles.description} ${styles.clampedDescription} ${showMore ? styles.expanded : ''}`}>{shownDescription}</p>
              <button className={styles.more} type="button" onClick={() => setShowMore(!showMore)}>
                Show {showMore ? 'less' : 'more'}
              </button>
            </div>
          ) : null}
          <div className={styles.actions}>
            {goingCount !== undefined ? <p className={styles.going}><strong>{goingCount}</strong> going</p> : null}
            <div className={styles.buttonRow}>
              {onSignup && event.signup.url ? (
                <button className={styles.signup} type="button" onClick={onSignup}>↗ Sign up</button>
              ) : null}
              <span className={styles.join}><JoinButton event={event} /><span>Join Event</span></span>
            </div>
            <SignupBadge signup={event.signup} />
          </div>
        </>
      ) : (
        <>
          <div className={styles.heading}>
            <div>
              <p className={styles.time}>{event.timeLabel}</p>
              <h2 className={styles.title}>{event.title}</h2>
            </div>
            <JoinButton event={event} />
          </div>
          <p className={styles.location}>{event.location}</p>
          {event.organizer ? <p className={styles.organizer}>{event.organizer}</p> : null}
          <SignupBadge signup={event.signup} />
          {event.description ? <p className={styles.description}>{event.description}</p> : null}
        </>
      )}
    </aside>
  );
}
