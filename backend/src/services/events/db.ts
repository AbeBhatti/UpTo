import type { UserRow } from "../verification/db.js";

/**
 * The slice of the database events touch, with Prisma's method shapes so the
 * real PrismaClient and the in-memory EventsFakeDb both fit. Rows mirror
 * prisma/schema.prisma (CampusEvent, EventSource, Attendance).
 */

export type AttendanceStatusValue = "GOING" | "INTERESTED" | "NOT_GOING";
export type ReviewStatusValue = "PENDING" | "APPROVED" | "REJECTED";

export interface EventSourceRow {
  id: string;
  type: "LIVEWHALE" | "FLYER" | "MANUAL";
  url: string;
  label: string;
  lastRunAt: Date | null;
  createdAt: Date;
}

export interface CampusEventRow {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  lat: number | null;
  lng: number | null;
  organizer: string | null;
  category: string | null;
  goingCount: number;
  reviewStatus: ReviewStatusValue;
  signupUrl: string | null;
  signupOpensAt: Date | null;
  signupClosesAt: Date | null;
  sourceId: string | null;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceRow {
  id: string;
  userId: string;
  campusEventId: string;
  status: AttendanceStatusValue;
  createdAt: Date;
  updatedAt: Date;
}

/** An event with its source and, at most, the one viewer's attendance row. */
export type EventWithDetails = CampusEventRow & {
  source: EventSourceRow | null;
  attendances: AttendanceRow[];
};

/**
 * Include shape that produces EventWithDetails. Only the viewer's own
 * attendance is loaded, which is all `myStatus` needs. A signed-out viewer
 * matches no rows.
 */
export function eventInclude(viewerId: string | null) {
  return {
    source: true,
    attendances: { where: { userId: viewerId ?? "" } },
  } as const;
}

export type EventInclude = ReturnType<typeof eventInclude>;

type Filter = Record<string, unknown>;
type Order = Record<string, "asc" | "desc">;
type AttendanceKey = { userId_campusEventId: { userId: string; campusEventId: string } };

export interface EventsDb {
  campusEvent: {
    findMany(args: {
      where: Filter;
      include: EventInclude;
      orderBy: Order[];
      skip?: number;
      take?: number;
    }): Promise<EventWithDetails[]>;
    findUnique(args: { where: { id: string }; include: EventInclude }): Promise<EventWithDetails | null>;
    findMany(args: { where: Filter; select: { id: true } }): Promise<Array<{ id: string }>>;
    count(args: { where: Filter }): Promise<number>;
    update(args: { where: { id: string }; data: { goingCount: number } }): Promise<CampusEventRow>;
  };
  attendance: {
    upsert(args: {
      where: AttendanceKey;
      create: { userId: string; campusEventId: string; status: AttendanceStatusValue };
      update: { status: AttendanceStatusValue };
    }): Promise<AttendanceRow>;
    count(args: { where: Filter }): Promise<number>;
  };
  user: {
    findUnique(args: { where: { id: string } }): Promise<UserRow | null>;
  };
  $transaction<T>(fn: (tx: EventsDb) => Promise<T>): Promise<T>;
}
