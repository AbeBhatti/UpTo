import type { EventWindow, ListEventsQuery } from '@upto/contracts';
import { headers } from 'next/headers';
import { getDiscoverData } from '@/lib/events';
import { DiscoverView } from './DiscoverView';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const WINDOWS: EventWindow[] = ['now', 'today', 'week', 'quarter', 'past'];
const FILTERS: NonNullable<ListEventsQuery['filter']>[] = ['all', 'free_food', 'active', 'career'];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const requestedWindow = first(params.when);
  const requestedFilter = first(params.show);
  const when = WINDOWS.includes(requestedWindow as EventWindow) ? requestedWindow as EventWindow : 'quarter';
  const filter = FILTERS.includes(requestedFilter as NonNullable<ListEventsQuery['filter']>)
    ? requestedFilter as NonNullable<ListEventsQuery['filter']>
    : 'all';
  let events = [] as Awaited<ReturnType<typeof getDiscoverData>>['events'];
  let now = new Date().toISOString();
  let counts: Record<string, number> = { all: 0, free_food: 0, clubs: 0, active: 0, career: 0 };
  let nextCursor: string | null = null;
  let error = '';
  try {
    const result = await getDiscoverData({ when, filter, limit: 50 }, { cookie: requestHeaders.get('cookie') ?? undefined });
    ({ events, now, counts, nextCursor } = result);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load events.';
  }
  const requestedEvent = first(params.event);
  const initialEventId = events.some((event) => event.id === requestedEvent)
    ? requestedEvent!
    : events[0]?.id ?? '';

  return (
    <DiscoverView
      events={events}
      now={now}
      counts={counts}
      total={counts.all ?? 0}
      nextCursor={nextCursor}
      error={error}
      when={when}
      filter={filter}
      initialEventId={initialEventId}
    />
  );
}
