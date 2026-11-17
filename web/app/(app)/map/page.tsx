import { headers } from 'next/headers';
import { getDiscoverData } from '@/lib/events';
import { MapView } from './MapView';

/**
 * The campus map: every live and upcoming event with a place, as pins over
 * SCU, beside a searchable list. Same data as Discover's default view
 * (GET /events with no window), with the viewer's session forwarded so Join
 * shows their own RSVP.
 */
export default async function MapPage() {
  const requestHeaders = await headers();
  let events = [] as Awaited<ReturnType<typeof getDiscoverData>>['events'];
  let error = '';
  try {
    ({ events } = await getDiscoverData(
      { filter: 'all', limit: 100 },
      { cookie: requestHeaders.get('cookie') ?? undefined },
    ));
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load events.';
  }

  return <MapView events={events} error={error} />;
}
