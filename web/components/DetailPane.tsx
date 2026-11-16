import type { CampusEvent } from '@upto/contracts';
import { JoinButton } from './JoinButton';
import { SignupBadge } from './SignupBadge';
import styles from './DetailPane.module.css';

interface DetailPaneProps {
  event: CampusEvent;
}

export function DetailPane({ event }: DetailPaneProps) {
  return (
    <aside className={styles.pane} aria-label={`${event.title} details`}>
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
    </aside>
  );
}
