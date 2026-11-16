import type { CampusEvent } from '@upto/contracts';
import { JoinButton } from './JoinButton';
import { SignupBadge } from './SignupBadge';
import { TimeTile } from './TimeTile';
import styles from './EventRow.module.css';

interface EventRowProps {
  event: CampusEvent;
}

export function EventRow({ event }: EventRowProps) {
  return (
    <article className={styles.row}>
      <TimeTile event={event} />
      <div className={styles.details}>
        <h3 className={styles.title}>{event.title}</h3>
        <p className={styles.location}>{event.location}</p>
        <SignupBadge signup={event.signup} />
      </div>
      <JoinButton event={event} />
    </article>
  );
}
