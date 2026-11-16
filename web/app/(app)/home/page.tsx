import type { CampusEvent } from '@upto/contracts';
import { headers } from 'next/headers';
import { getHomeData } from '@/lib/events';
import { EventRow, JoinButton, SectionHeader, SignupBadge, TimeTile } from '@/components';
import styles from './home.module.css';

const TIME_ZONE = 'America/Los_Angeles';
// Fixture dates are in Fall quarter, which starts Monday, September 21, 2026.
// Contracts and fixtures do not carry the quarter or academic week number.
const FALL_QUARTER_START = '2026-09-21T00:00:00-07:00';

function dateParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
}

function pacificDateKey(value: string) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function weekNumber(value: string) {
  const day = pacificDateKey(value);
  const current = new Date(`${day}T12:00:00Z`).getTime();
  const startParts = dateParts(FALL_QUARTER_START);
  const start = new Date(`${startParts.year}-${startParts.month}-${startParts.day}T12:00:00Z`).getTime();
  return Math.floor((current - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function dateHeadline(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function CampusIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    dining: <><path d="M5 3v7" /><path d="M8 3v7" /><path d="M5 7h3" /><path d="M6.5 10v11" /><path d="M17 3v18" /><path d="M17 3c3 2 3 6 0 8" /></>,
    gym: <><path d="m3 9 6 6" /><path d="m5 7 4-4 8 8-4 4" /><path d="m15 17 4-4" /><path d="m17 19 4-4" /></>,
    athletics: <><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v2a4 4 0 0 0 4 4" /><path d="M17 6h3v2a4 4 0 0 1-4 4" /><path d="M12 14v5" /><path d="M8 21h8" /></>,
    safety: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function LaterCard({ event }: { event: CampusEvent }) {
  return (
    <article className={styles.laterCard}>
      <div className={styles.laterCopy}>
        <TimeTile event={event} inline />
        <h3>{event.title}</h3>
        <p className={styles.location}>{event.location}</p>
        <SignupBadge signup={event.signup} />
      </div>
      <JoinButton event={event} />
    </article>
  );
}

export default async function HomePage() {
  // Reading the request makes Home render per request, as Discover does,
  // instead of a build-time snapshot; the cookie carries the viewer's session.
  const requestHeaders = await headers();
  // Each section is one of the server's event windows (now, today, week), the
  // same ones Discover's WHEN rail uses, in the server's order.
  const { rightNow, laterToday, thisWeek, now, campusRail } = await getHomeData({
    cookie: requestHeaders.get('cookie') ?? undefined,
  });

  const leftWeek = thisWeek.filter((_, index) => index % 2 === 0);
  const rightWeek = thisWeek.filter((_, index) => index % 2 === 1);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.pageHeader}>
          <p className={styles.quarter}>Week {weekNumber(now)} · Fall Quarter</p>
          <h1>{dateHeadline(now)}</h1>
        </header>

        <div className={styles.columns}>
          <div className={styles.mainColumn}>
            <section className={styles.section} aria-label="Right Now">
              <SectionHeader title="Right Now" />
              <div className={styles.liveGrid}>
                {rightNow.map((event) => <EventRow key={event.id} event={event} />)}
              </div>
            </section>

            <section className={styles.section} aria-label="Later today">
              <SectionHeader title="Later today" />
              <div className={styles.laterGrid}>
                {laterToday.map((event) => <LaterCard key={event.id} event={event} />)}
              </div>
            </section>

            <section className={styles.section} aria-label="This week">
              <SectionHeader title="This week" actionLabel="See all" actionHref="/discover" />
              <div className={styles.weekGrid}>
                <div>{leftWeek.map((event) => <EventRow key={event.id} event={event} />)}</div>
                <div>{rightWeek.map((event) => <EventRow key={event.id} event={event} />)}</div>
              </div>
            </section>
          </div>

          <aside className={styles.campusRail} aria-label="On campus">
            <SectionHeader title="On campus" />
            <ul className={styles.campusList}>
              {campusRail.map((item) => (
                <li key={item.key}>
                  <div className={styles.campusLink}>
                    <span className={styles.iconTile}><CampusIcon name={item.key} /></span>
                    <span className={styles.campusCopy}>
                      <span className={styles.campusTitle}>{item.title}</span>
                      <span className={styles.campusSubtitle}>{item.subtitle}</span>
                    </span>
                    <span className={styles.campusStatus}>{item.status}</span>
                    <span className={styles.chevron} aria-hidden="true">›</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
