import type { CampusEvent } from '@upto/contracts';
import styles from './TimeTile.module.css';

interface TimeTileProps {
  event: Pick<CampusEvent, 'timeLabel'>;
  /** A card puts the time on one line above its title. */
  inline?: boolean;
  /** Discover rows get the wider time column without changing Home. */
  discover?: boolean;
}

/**
 * The server's timeLabel, shown verbatim, on two lines the way the app sets
 * it: what it is above, the clock time below ("Ends around" / "2:00 p.m.",
 * "Tomorrow" / "11:00 a.m."). Without a clock time the last word drops down
 * ("2 hrs" / "left"). The text is never changed, only where it wraps, so a
 * word is never broken in half.
 */
export function splitTimeLabel(label: string): [string, string] {
  const clock = label.search(/\b\d{1,2}:\d{2}\s?[ap]\.?m\.?/i);
  if (clock > 0) return [label.slice(0, clock).trim(), label.slice(clock).trim()];
  const lastSpace = label.lastIndexOf(' ');
  if (lastSpace > 0) return [label.slice(0, lastSpace), label.slice(lastSpace + 1)];
  return [label, ''];
}

export function TimeTile({ event, inline = false, discover = false }: TimeTileProps) {
  const tileClass = `${styles.tile} ${discover ? styles.discover : ''}`;
  if (inline) return <span className={`${tileClass} ${styles.inline}`}>{event.timeLabel}</span>;
  const [top, bottom] = splitTimeLabel(event.timeLabel);
  return (
    <span className={tileClass}>
      <span className={styles.line}>{top}</span>
      {bottom ? <span className={styles.line}>{bottom}</span> : null}
    </span>
  );
}
