import type { CampusEvent } from '@upto/contracts';
import { JoinButton } from './JoinButton';
import { SignupBadge } from './SignupBadge';
import { TimeTile } from './TimeTile';
import styles from './EventRow.module.css';

interface EventRowProps {
  event: CampusEvent;
  selected?: boolean;
  live?: boolean;
  organizerLine?: string;
  signupText?: string;
  organizerStyle?: React.CSSProperties;
  onSelect?: () => void;
}

export function EventRow({ event, selected = false, live, organizerLine, signupText, organizerStyle, onSelect }: EventRowProps) {
  const timeLabel = live ? 'NOW' : event.timeLabel;
  const discoverMetadata = organizerLine !== undefined || signupText !== undefined;
  const details = (
    <span className={styles.details}>
      <span className={styles.title}>{event.title}</span>
      <span className={styles.location}>{event.location}</span>
      {discoverMetadata ? (
        <span className={styles.metadata}>
          {organizerLine ? <span className={styles.organizer} style={organizerStyle}>{organizerLine}</span> : null}
          {organizerLine && signupText ? <span aria-hidden="true"> · </span> : null}
          {signupText ? <span>{signupText}</span> : null}
        </span>
      ) : <SignupBadge signup={event.signup} />}
    </span>
  );

  return (
    <article className={`${styles.row} ${onSelect ? '' : styles.plainRow} ${selected ? styles.selected : ''}`}>
      {onSelect ? (
        <button
          type="button"
          className={styles.selectable}
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          aria-label={`View details for ${event.title}`}
        >
          <TimeTile event={{ timeLabel }} discover />
          {details}
        </button>
      ) : (
        <>
          <TimeTile event={event} />
          {details}
        </>
      )}
      <JoinButton event={event} />
    </article>
  );
}
