/**
 * In-memory fake database for the verification tests (Lab 6 harness).
 *
 * Exposes the models confirmVerification touches with Prisma's method shapes
 * (findUnique, findFirst, findMany, create, update, updateMany, upsert,
 * delete, deleteMany, count, $transaction), plus `db.tables.*` arrays so a
 * test can look at raw rows, e.g. `db.tables.accountHandoff.length`.
 *
 * Models are GETTERS on the class prototype that hand out a fresh delegate on
 * every access. That is exactly what Lab 6's `slowDown()` relies on: it looks
 * the getter up on `Object.getPrototypeOf(db)`, shadows it on the instance,
 * and deletes the shadow to restore.
 *
 * Unique columns are enforced and throw a Prisma-shaped P2002 error, so the
 * E1 "unique clash on the stamp" path is reachable. Deleting a challenge
 * cascades to its codes, as the real foreign key does.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;
type Where = Record<string, any>;

type TableName = "user" | "campusVerificationChallenge" | "campusVerificationCode" | "accountHandoff";

const UNIQUE: Record<TableName, string[]> = {
  user: ["id", "username", "email", "phone", "googleId", "campusEmail"],
  campusVerificationChallenge: ["id", "userId"],
  campusVerificationCode: ["id"],
  accountHandoff: ["id", "tokenHash"],
};

const DEFAULTS: Record<TableName, () => Row> = {
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
  campusVerificationChallenge: () => ({ attempts: 0, lastSentAt: null, sendCount: 0 }),
  campusVerificationCode: () => ({}),
  accountHandoff: () => ({ consumedAt: null }),
};

/** Mirrors Prisma's error for a unique constraint violation. */
export class UniqueConstraintError extends Error {
  readonly code = "P2002";
  readonly meta: { target: string[] };
  constructor(table: string, field: string) {
    super(`Unique constraint failed on ${table}.${field}`);
    this.meta = { target: [field] };
  }
}

/** Mirrors Prisma's error for update/delete of a missing record. */
export class RecordNotFoundError extends Error {
  readonly code = "P2025";
  constructor(table: string) {
    super(`No ${table} record found`);
  }
}

// ---------------------------------------------------------------------------
// Where-clause matching (the subset of Prisma's filters the services use)
// ---------------------------------------------------------------------------

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function isOperatorObject(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !(value instanceof Date) && !Array.isArray(value);
}

function matchField(actual: unknown, condition: unknown): boolean {
  if (!isOperatorObject(condition)) return comparable(actual) === comparable(condition);

  const a = comparable(actual) as any;
  for (const [op, raw] of Object.entries(condition)) {
    const v = comparable(raw) as any;
    switch (op) {
      case "equals":
        if (a !== v) return false;
        break;
      case "not":
        if (isOperatorObject(raw) ? matchField(actual, raw) : a === v) return false;
        break;
      case "in":
        if (!(raw as unknown[]).map(comparable).includes(a)) return false;
        break;
      case "notIn":
        if ((raw as unknown[]).map(comparable).includes(a)) return false;
        break;
      case "lt":
        if (!(a !== null && a < v)) return false;
        break;
      case "lte":
        if (!(a !== null && a <= v)) return false;
        break;
      case "gt":
        if (!(a !== null && a > v)) return false;
        break;
      case "gte":
        if (!(a !== null && a >= v)) return false;
        break;
      default:
        throw new Error(`fakeDb: unsupported filter operator "${op}"`);
    }
  }
  return true;
}

export function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;
    if (key === "AND") {
      const all = Array.isArray(condition) ? condition : [condition];
      if (!all.every((w: Where) => matches(row, w))) return false;
    } else if (key === "OR") {
      if (!(condition as Where[]).some((w) => matches(row, w))) return false;
    } else if (key === "NOT") {
      const all = Array.isArray(condition) ? condition : [condition];
      if (all.some((w: Where) => matches(row, w))) return false;
    } else if (!matchField(row[key], condition)) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row): Row {
  const next = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (isOperatorObject(value) && ("increment" in value || "decrement" in value || "set" in value)) {
      if ("set" in value) next[key] = value.set;
      if ("increment" in value) next[key] = (next[key] ?? 0) + value.increment;
      if ("decrement" in value) next[key] = (next[key] ?? 0) - value.decrement;
    } else {
      next[key] = value;
    }
  }
  return next;
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  // Array.prototype.sort is stable, so equal keys keep insertion order.
  return [...rows].sort((x, y) => {
    for (const key of keys) {
      const [field, direction] = Object.entries(key)[0] as [string, "asc" | "desc"];
      const a = comparable(x[field]) as any;
      const b = comparable(y[field]) as any;
      if (a === b) continue;
      const order = a < b ? -1 : 1;
      return direction === "desc" ? -order : order;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// The fake client
// ---------------------------------------------------------------------------

export class FakeDb {
  tables: Record<TableName, Row[]> = {
    user: [],
    campusVerificationChallenge: [],
    campusVerificationCode: [],
    accountHandoff: [],
  };

  /** The clock rows are stamped with when `createdAt` is not supplied. */
  clock: () => Date = () => new Date();

  private sequence = 0;

  get user(): any {
    return this.delegate("user");
  }

  get campusVerificationChallenge(): any {
    return this.delegate("campusVerificationChallenge");
  }

  get campusVerificationCode(): any {
    return this.delegate("campusVerificationCode");
  }

  get accountHandoff(): any {
    return this.delegate("accountHandoff");
  }

  /**
   * Interactive transactions run against the same fake. There is no rollback:
   * the services are written so every race is decided by one conditional
   * write (updateMany / deleteMany count), which is what the tests exercise.
   */
  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /** Empties every table. Call between tests. */
  reset(): void {
    for (const name of Object.keys(this.tables) as TableName[]) this.tables[name] = [];
    this.sequence = 0;
  }

  private nextId(table: TableName): string {
    this.sequence += 1;
    return `${table}_${this.sequence}`;
  }

  private assertUnique(table: TableName, candidate: Row, ignoreId?: string): void {
    for (const field of UNIQUE[table]) {
      const value = candidate[field];
      if (value === null || value === undefined) continue;
      const clash = this.tables[table].some(
        (row) => row.id !== ignoreId && comparable(row[field]) === comparable(value),
      );
      if (clash) throw new UniqueConstraintError(table, field);
    }
  }

  private withIncludes(table: TableName, row: Row, include: Row | undefined): Row {
    const copy = structuredClone(row);
    if (table === "campusVerificationChallenge" && include?.codes) {
      copy.codes = sortRows(
        this.tables.campusVerificationCode.filter((code) => code.challengeId === row.id),
        [{ createdAt: "asc" }],
      ).map((code) => structuredClone(code));
    }
    return copy;
  }

  private remove(table: TableName, doomed: Row[]): void {
    const ids = new Set(doomed.map((row) => row.id));
    this.tables[table] = this.tables[table].filter((row) => !ids.has(row.id));
    // onDelete: Cascade from challenge to its codes.
    if (table === "campusVerificationChallenge") {
      this.tables.campusVerificationCode = this.tables.campusVerificationCode.filter(
        (code) => !ids.has(code.challengeId),
      );
    }
  }

  private delegate(table: TableName) {
    const db = this;
    const rows = () => db.tables[table];

    const create = async ({ data }: { data: Row }) => {
      const now = db.clock();
      const row: Row = {
        ...DEFAULTS[table](),
        id: db.nextId(table),
        createdAt: now,
        ...(table === "accountHandoff" || table === "campusVerificationCode" ? {} : { updatedAt: now }),
        ...data,
      };
      db.assertUnique(table, row);
      rows().push(row);
      return structuredClone(row);
    };

    const updateRow = (row: Row, data: Row): Row => {
      const next = applyData(row, data);
      if ("updatedAt" in row) next.updatedAt = db.clock();
      db.assertUnique(table, next, row.id);
      const index = rows().indexOf(row);
      rows()[index] = next;
      return next;
    };

    return {
      findUnique: async ({ where, include }: { where: Where; include?: Row }) => {
        const row = rows().find((r) => matches(r, where));
        return row ? db.withIncludes(table, row, include) : null;
      },
      findFirst: async ({ where, include, orderBy }: { where?: Where; include?: Row; orderBy?: Row } = {}) => {
        const row = sortRows(rows().filter((r) => matches(r, where)), orderBy)[0];
        return row ? db.withIncludes(table, row, include) : null;
      },
      findMany: async ({ where, include, orderBy }: { where?: Where; include?: Row; orderBy?: Row } = {}) =>
        sortRows(rows().filter((r) => matches(r, where)), orderBy).map((r) => db.withIncludes(table, r, include)),
      count: async ({ where }: { where?: Where } = {}) => rows().filter((r) => matches(r, where)).length,
      create,
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = rows().find((r) => matches(r, where));
        if (!row) throw new RecordNotFoundError(table);
        return structuredClone(updateRow(row, data));
      },
      updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
        const targets = rows().filter((r) => matches(r, where));
        for (const row of targets) updateRow(row, data);
        return { count: targets.length };
      },
      upsert: async ({ where, create: createData, update }: { where: Where; create: Row; update: Row }) => {
        const row = rows().find((r) => matches(r, where));
        return row ? structuredClone(updateRow(row, update)) : create({ data: createData });
      },
      delete: async ({ where }: { where: Where }) => {
        const row = rows().find((r) => matches(r, where));
        if (!row) throw new RecordNotFoundError(table);
        db.remove(table, [row]);
        return structuredClone(row);
      },
      deleteMany: async ({ where }: { where?: Where } = {}) => {
        const doomed = rows().filter((r) => matches(r, where));
        db.remove(table, doomed);
        return { count: doomed.length };
      },
    };
  }
}

/** The shared instance the verification tests run against. */
export const db = new FakeDb();

// ---------------------------------------------------------------------------
// Lab 6 appendix, verbatim: delays one fake call by 30 ms so two requests
// overlap the same way on every run.
// ---------------------------------------------------------------------------

function slowDown(model: "user" | "campusVerificationChallenge", method: string, ms = 30): () => void {
  const base = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(db), model)!.get!;
  Object.defineProperty(db, model, {
    configurable: true,
    get() {
      const m = base.call(db);
      const original = m[method];
      m[method] = async (args: unknown) => {
        await new Promise((r) => setTimeout(r, ms));
        return original(args);
      };
      return m;
    },
  });
  return () => delete (db as any)[model];
}

export { slowDown };
