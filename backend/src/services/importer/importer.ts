import { LIVEWHALE_LABEL, parseLiveWhale, type ImportedEvent, type LiveWhaleResponse, type Skipped } from "./livewhale.js";

/**
 * Writes one LiveWhale response through its EventSource (Lab 4: EventSource
 * "type, url", 1..* imported into CampusEvent). Manual only: run from
 * cli.ts; there is no schedule.
 *
 * Re-running is safe. Events are keyed on (sourceId, externalId), which the
 * schema makes unique, so a second import updates rows instead of adding
 * them. A NEW event lands as PENDING and goes through the admin queue. An
 * existing event keeps its reviewStatus and goingCount, so re-importing never
 * puts approved events back in the queue or loses RSVPs.
 *
 * Not handled yet: an event canceled after it was imported is skipped by the
 * parse, so its row stays as it was. Taking those down is a follow-up.
 */

export interface EventSourceRow {
  id: string;
  type: "LIVEWHALE" | "FLYER" | "MANUAL";
  url: string;
  label: string;
  lastRunAt: Date | null;
}

type EventColumns = Omit<ImportedEvent, "externalId">;

export interface ImporterDb {
  eventSource: {
    findFirst(args: { where: { type: "LIVEWHALE"; url: string } }): Promise<EventSourceRow | null>;
    create(args: { data: { type: "LIVEWHALE"; url: string; label: string } }): Promise<EventSourceRow>;
    update(args: { where: { id: string }; data: { lastRunAt: Date } }): Promise<EventSourceRow>;
  };
  campusEvent: {
    findUnique(args: {
      where: { sourceId_externalId: { sourceId: string; externalId: string } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: { data: EventColumns & { sourceId: string; externalId: string; reviewStatus: "PENDING" } }): Promise<unknown>;
    update(args: { where: { id: string }; data: EventColumns }): Promise<unknown>;
  };
}

export interface ImportResult {
  sourceId: string;
  created: number;
  updated: number;
  skipped: Skipped[];
}

export async function importLiveWhale(db: ImporterDb, feedUrl: string, response: LiveWhaleResponse, now: Date): Promise<ImportResult> {
  const source =
    (await db.eventSource.findFirst({ where: { type: "LIVEWHALE", url: feedUrl } })) ??
    (await db.eventSource.create({ data: { type: "LIVEWHALE", url: feedUrl, label: LIVEWHALE_LABEL } }));

  const { events, skipped } = parseLiveWhale(response);
  let created = 0;
  let updated = 0;
  for (const { externalId, ...columns } of events) {
    const existing = await db.campusEvent.findUnique({
      where: { sourceId_externalId: { sourceId: source.id, externalId } },
      select: { id: true },
    });
    if (existing) {
      await db.campusEvent.update({ where: { id: existing.id }, data: columns });
      updated += 1;
    } else {
      await db.campusEvent.create({ data: { ...columns, sourceId: source.id, externalId, reviewStatus: "PENDING" } });
      created += 1;
    }
  }

  await db.eventSource.update({ where: { id: source.id }, data: { lastRunAt: now } });
  return { sourceId: source.id, created, updated, skipped };
}
