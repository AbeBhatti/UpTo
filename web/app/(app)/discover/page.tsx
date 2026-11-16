import type { EventWindow, ListEventsQuery } from '@upto/contracts';
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
  const requestedWindow = first(params.when);
  const requestedFilter = first(params.show);
  const when = WINDOWS.includes(requestedWindow as EventWindow) ? requestedWindow as EventWindow : 'quarter';
  const filter = FILTERS.includes(requestedFilter as NonNullable<ListEventsQuery['filter']>)
    ? requestedFilter as NonNullable<ListEventsQuery['filter']>
    : 'all';
  const { events, now, counts } = await getDiscoverData({ when, filter });
  const requestedEvent = first(params.event);
  const initialEventId = events.some((event) => event.id === requestedEvent)
    ? requestedEvent!
    : events[0]?.id ?? '';

  return (
    <DiscoverView
      events={events}
      now={now}
      counts={counts}
      when={when}
      filter={filter}
      initialEventId={initialEventId}
    />
  );
}
