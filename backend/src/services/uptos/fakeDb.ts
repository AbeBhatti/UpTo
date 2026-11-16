/**
 * In-memory fake database for the Up-To, poll, drop and report tests, built
 * the same way as services/events/fakeDb.ts: Prisma's method shapes, models as
 * getters that hand out a delegate, `db.tables.*` for raw rows, `clock` for
 * stamps, and `reset()` between tests. It reuses Abe's where-clause matcher
 * and Prisma-shaped errors from services/verification/fakeDb.ts.
 *
 * The controllers these back never use `include`: each one reads related rows
 * with its own query. So the fake needs no relation loading, and what it does
 * support is exactly findUnique, findFirst, findMany (where, orderBy, take),
 * count, create, update, upsert, delete, deleteMany and $transaction.
 *
 * Unique columns from prisma/schema.prisma are enforced and throw P2002, and
 * the compound keys (upToId_userId, slotId_userId, dropId_userId,
 * authorId_clientRef) resolve as Prisma's do.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { RecordNotFoundError, UniqueConstraintError, matches } from "../verification/fakeDb.js";

type Row = Record<string, any>;
type Where = Record<string, any>;

export type ContentTable =
  | "user"
  | "upTo"
  | "upToRsvp"
  | "poll"
  | "pollSlot"
  | "pollResponse"
  | "drop"
  | "dropVote"
  | "dropRulesAgreement"
  | "report";

const TABLES: ContentTable[] = [
  "user",
  "upTo",
  "upToRsvp",
  "poll",
  "pollSlot",
  "pollResponse",
  "drop",
  "dropVote",
  "dropRulesAgreement",
  "report",
];

const DEFAULTS: Record<ContentTable, () => Row> = {
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
  upTo: () => ({ description: null, lat: null, lng: null, contact: null, published: false, publishedAt: null }),
  upToRsvp: () => ({ anonymous: false }),
  poll: () => ({}),
  pollSlot: () => ({}),
  pollResponse: () => ({}),
  drop: () => ({ clientRef: null }),
  dropVote: () => ({}),
  dropRulesAgreement: () => ({}),
  report: () => ({ details: null, resolvedAt: null, dropId: null, upToId: null, messageId: null }),
};

/** Unique columns per table, as prisma/schema.prisma declares them. Null never clashes. */
const UNIQUE: Record<ContentTable, string[][]> = {
  user: [["username"], ["email"], ["phone"], ["googleId"], ["campusEmail"]],
  upTo: [["shareSlug"]],
  upToRsvp: [["upToId", "userId"]],
  poll: [["upToId"]],
  pollSlot: [],
  pollResponse: [["slotId", "userId"]],
  drop: [["authorId", "clientRef"]],
  dropVote: [["dropId", "userId"]],
  dropRulesAgreement: [["userId"]],
  report: [],
};

const COMPOUND_KEYS = ["upToId_userId", "slotId_userId", "dropId_userId", "authorId_clientRef"];

/** Prisma's compound-key where (`{ upToId_userId: { upToId, userId } }`) as a plain filter. */
function flatten(where: Where): Where {
  for (const key of COMPOUND_KEYS) if (where[key]) return { ...where[key] };
  return where;
}

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

/** Prisma orderBy on Postgres: ascending puts nulls last, descending puts them first. */
function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((x, y) => {
    for (const key of keys) {
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

export class ContentFakeDb {
  tables = Object.fromEntries(TABLES.map((name) => [name, [] as Row[]])) as Record<ContentTable, Row[]>;

  /** The clock rows are stamped with when `createdAt` is not supplied. */
  clock: () => Date = () => new Date();

  private sequence = 0;

  get user(): any {
    return this.delegate("user");
  }
  get upTo(): any {
    return this.delegate("upTo");
  }
  get upToRsvp(): any {
    return this.delegate("upToRsvp");
  }
  get poll(): any {
    return this.delegate("poll");
  }
  get pollSlot(): any {
    return this.delegate("pollSlot");
  }
  get pollResponse(): any {
    return this.delegate("pollResponse");
  }
  get drop(): any {
    return this.delegate("drop");
  }
  get dropVote(): any {
    return this.delegate("dropVote");
  }
  get dropRulesAgreement(): any {
    return this.delegate("dropRulesAgreement");
  }
  get report(): any {
    return this.delegate("report");
  }

  /** No rollback, as in FakeDb: the callback runs against the same fake. */
  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /** Empties every table. Call between tests. */
  reset(): void {
    for (const name of TABLES) this.tables[name] = [];
    this.sequence = 0;
  }

  /** Inserts a row with the model's defaults and enforces unique columns. */
  insert(table: ContentTable, data: Row): Row {
    const now = this.clock();
    this.sequence += 1;
    const row: Row = { ...DEFAULTS[table](), id: `${table}_${this.sequence}`, createdAt: now, ...data };
    if (table === "upTo" || table === "user") row.updatedAt ??= now;
    this.assertUnique(table, row);
    this.tables[table].push(row);
    return row;
  }

  private assertUnique(table: ContentTable, row: Row, ignoreId?: string): void {
    for (const columns of [["id"], ...UNIQUE[table]]) {
      if (columns.some((column) => row[column] === null || row[column] === undefined)) continue;
      const clash = this.tables[table].some(
        (other) => other.id !== ignoreId && columns.every((column) => comparable(other[column]) === comparable(row[column])),
      );
      if (clash) throw new UniqueConstraintError(table, columns.join("_"));
    }
  }

  private delegate(table: ContentTable) {
    const db = this;
    const rows = () => db.tables[table];
    const pick = (row: Row, select?: Row) =>
      select ? Object.fromEntries(Object.keys(select).map((field) => [field, row[field]])) : structuredClone(row);

    return {
      findUnique: async ({ where, select }: { where: Where; select?: Row }) => {
        const row = rows().find((r) => matches(r, flatten(where)));
        return row ? pick(row, select) : null;
      },
      findFirst: async ({ where, orderBy, select }: { where?: Where; orderBy?: Row | Row[]; select?: Row } = {}) => {
        const row = sortRows(rows().filter((r) => matches(r, where)), orderBy)[0];
        return row ? pick(row, select) : null;
      },
      findMany: async ({ where, orderBy, take, select }: { where?: Where; orderBy?: Row | Row[]; take?: number; select?: Row } = {}) => {
        const sorted = sortRows(rows().filter((r) => matches(r, where)), orderBy);
        return (take === undefined ? sorted : sorted.slice(0, take)).map((r) => pick(r, select));
      },
      count: async ({ where }: { where?: Where } = {}) => rows().filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Row }) => structuredClone(db.insert(table, data)),
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = rows().find((r) => matches(r, flatten(where)));
        if (!row) throw new RecordNotFoundError(table);
        const next = { ...row, ...data };
        if ("updatedAt" in row) next.updatedAt = db.clock();
        db.assertUnique(table, next, row.id);
        Object.assign(row, next);
        return structuredClone(row);
      },
      upsert: async ({ where, create, update }: { where: Where; create: Row; update: Row }) => {
        const row = rows().find((r) => matches(r, flatten(where)));
        if (!row) return structuredClone(db.insert(table, create));
        Object.assign(row, update);
        if ("updatedAt" in row) row.updatedAt = db.clock();
        return structuredClone(row);
      },
      delete: async ({ where }: { where: Where }) => {
        const row = rows().find((r) => matches(r, flatten(where)));
        if (!row) throw new RecordNotFoundError(table);
        db.tables[table] = rows().filter((r) => r !== row);
        return structuredClone(row);
      },
      deleteMany: async ({ where }: { where?: Where } = {}) => {
        const doomed = rows().filter((r) => matches(r, where));
        db.tables[table] = rows().filter((r) => !doomed.includes(r));
        return { count: doomed.length };
      },
    };
  }
}

/** The shared instance the Up-To, poll, drop and report tests run against. */
export const contentDb = new ContentFakeDb();
