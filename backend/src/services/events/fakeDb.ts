/**
 * In-memory fake database for the events tests, built the same way as
 * services/verification/fakeDb.ts: Prisma's method shapes, models as getters
 * that hand out a delegate, `db.tables.*` for raw rows, `clock` for stamps,
 * and `reset()` between tests. It reuses that file's where-clause matcher and
 * error classes rather than forking them.
 *
 * It is a separate class only because FakeDb's table list is closed and the
 * file is Abe's. If FakeDb grows a way to register tables, this can fold in.
 *
 * Covers exactly what the events controller and Attendance.setStatus use:
 * findMany (where, orderBy with nulls last on asc as Postgres does, skip,
 * take, include or select), findUnique, count, update, upsert on the
 * userId_campusEventId compound key, and $transaction.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { RecordNotFoundError, UniqueConstraintError, matches } from "../verification/fakeDb.js";

type Row = Record<string, any>;
type Where = Record<string, any>;
type TableName = "campusEvent" | "eventSource" | "attendance" | "user";

const DEFAULTS: Record<TableName, () => Row> = {
  campusEvent: () => ({
    description: null,
    endsAt: null,
    lat: null,
    lng: null,
    organizer: null,
    category: null,
    goingCount: 0,
    reviewStatus: "PENDING",
    signupUrl: null,
    signupOpensAt: null,
    signupClosesAt: null,
    sourceId: null,
    externalId: null,
  }),
  eventSource: () => ({ lastRunAt: null }),
  attendance: () => ({}),
  user: () => ({
    email: null,
    phone: null,
    passwordHash: null,
    googleId: null,
    avatarSeed: null,
    avatarUrl: null,
    isVerifiedStudent: false,
    campusEmail: null,
    campusVerifiedAt: null,
    classOf: null,
    isAdmin: false,
  }),
};

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

/** Prisma orderBy on Postgres: ascending puts nulls last, descending puts them first. */
function sortRows(rows: Row[], orderBy: Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  return [...rows].sort((x, y) => {
    for (const key of orderBy) {
      const [field, direction] = Object.entries(key)[0] as [string, "asc" | "desc"];
      const a = comparable(x[field]) as any;
      const b = comparable(y[field]) as any;
      if (a === b) continue;
      if (a === null || a === undefined) return direction === "asc" ? 1 : -1;
      if (b === null || b === undefined) return direction === "asc" ? -1 : 1;
      const order = a < b ? -1 : 1;
      return direction === "desc" ? -order : order;
    }
    return 0;
  });
}

function compoundKey(where: Where): Where {
  return where.userId_campusEventId ?? where;
}

export class EventsFakeDb {
  tables: Record<TableName, Row[]> = { campusEvent: [], eventSource: [], attendance: [], user: [] };

  /** The clock rows are stamped with when `createdAt` is not supplied. */
  clock: () => Date = () => new Date();

  private sequence = 0;

  get campusEvent(): any {
    return this.delegate("campusEvent");
  }

  get eventSource(): any {
    return this.delegate("eventSource");
  }

  get attendance(): any {
    return this.delegate("attendance");
  }

  get user(): any {
    return this.delegate("user");
  }

  /** No rollback, as in FakeDb: the callback runs against the same fake. */
  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /** Empties every table. Call between tests. */
  reset(): void {
    for (const name of Object.keys(this.tables) as TableName[]) this.tables[name] = [];
    this.sequence = 0;
  }

  /** Inserts a row with the model's defaults, for test setup. */
  insert(table: TableName, data: Row): Row {
    const now = this.clock();
    this.sequence += 1;
    const row = { ...DEFAULTS[table](), id: `${table}_${this.sequence}`, createdAt: now, updatedAt: now, ...data };
    if (this.tables[table].some((existing) => existing.id === row.id)) throw new UniqueConstraintError(table, "id");
    this.tables[table].push(row);
    return row;
  }

  private present(table: TableName, row: Row, args: { include?: Row; select?: Row }): Row {
    if (args.select) {
      return Object.fromEntries(Object.keys(args.select).map((field) => [field, row[field]]));
    }
    const copy = structuredClone(row);
    if (table === "campusEvent" && args.include) {
      if (args.include.source) {
        const source = this.tables.eventSource.find((s) => s.id === row.sourceId);
        copy.source = source ? structuredClone(source) : null;
      }
      if (args.include.attendances) {
        const filter = args.include.attendances === true ? undefined : args.include.attendances.where;
        copy.attendances = this.tables.attendance
          .filter((a) => a.campusEventId === row.id && matches(a, filter))
          .map((a) => structuredClone(a));
      }
    }
    return copy;
  }

  private delegate(table: TableName) {
    const db = this;
    const rows = () => db.tables[table];

    return {
      findUnique: async (args: { where: Where; include?: Row; select?: Row }) => {
        const row = rows().find((r) => matches(r, compoundKey(args.where)));
        return row ? db.present(table, row, args) : null;
      },
      findMany: async (args: { where?: Where; orderBy?: Row[]; skip?: number; take?: number; include?: Row; select?: Row } = {}) => {
        const sorted = sortRows(rows().filter((r) => matches(r, args.where)), args.orderBy);
        const start = args.skip ?? 0;
        const page = args.take === undefined ? sorted.slice(start) : sorted.slice(start, start + args.take);
        return page.map((r) => db.present(table, r, args));
      },
      count: async ({ where }: { where?: Where } = {}) => rows().filter((r) => matches(r, where)).length,
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = rows().find((r) => matches(r, where));
        if (!row) throw new RecordNotFoundError(table);
        Object.assign(row, data, { updatedAt: db.clock() });
        return structuredClone(row);
      },
      upsert: async ({ where, create, update }: { where: Where; create: Row; update: Row }) => {
        const row = rows().find((r) => matches(r, compoundKey(where)));
        if (row) {
          Object.assign(row, update, { updatedAt: db.clock() });
          return structuredClone(row);
        }
        return structuredClone(db.insert(table, create));
      },
    };
  }
}

/** The shared instance the events tests run against. */
export const eventsDb = new EventsFakeDb();
