type RawSqliteModule = {
  DatabaseSync: new (location: string) => RawDatabase;
};

type RawDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): RawStatement;
};

type RawStatement = {
  all(...params: SqliteBindValue[]): unknown[];
  get(...params: SqliteBindValue[]): unknown | undefined;
  run(...params: SqliteBindValue[]): StatementRunResult;
};

type SqliteBindValue = string | number | bigint | null | Uint8Array;

export type StatementRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

export class AppStatement {
  constructor(private readonly statement: RawStatement) {}

  all(...params: unknown[]): unknown[] {
    return this.statement.all(...normalizeParams(params));
  }

  get(...params: unknown[]): unknown | undefined {
    return this.statement.get(...normalizeParams(params));
  }

  run(...params: unknown[]): StatementRunResult {
    return this.statement.run(...normalizeParams(params));
  }
}

export class AppDatabase {
  private transactionDepth = 0;
  private readonly db: RawDatabase;

  constructor(location: string) {
    // Use process.getBuiltinModule rather than require("node:sqlite"): the latter
    // (via createRequire(import.meta.url)) cannot be externalized by Next's
    // production webpack bundle ("Unsupported external type Url for commonjs
    // reference"), which breaks `next start` and packaged builds. getBuiltinModule
    // is a plain runtime property access bundlers leave untouched. (Node 22.3+.)
    const { DatabaseSync } =
      process.getBuiltinModule("node:sqlite") as unknown as RawSqliteModule;
    this.db = new DatabaseSync(location);
  }

  close(): void {
    this.db.close();
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): AppStatement {
    return new AppStatement(this.db.prepare(sql));
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    const rows = this.prepare(`PRAGMA ${sql}`).all();
    if (!options?.simple) return rows;

    const first = rows[0];
    if (!first || typeof first !== "object") return undefined;
    return Object.values(first as Record<string, unknown>)[0];
  }

  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      const depth = this.transactionDepth++;
      const savepoint = `__reviewer_tx_${depth}`;
      this.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);

      try {
        const result = fn(...args) as ReturnType<T>;
        this.exec(depth === 0 ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        try {
          this.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO SAVEPOINT ${savepoint}`);
          if (depth > 0) this.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } finally {
          throw error;
        }
      } finally {
        this.transactionDepth--;
      }
    }) as T;
  }
}

function normalizeParams(params: unknown[]): SqliteBindValue[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    ) {
      return value;
    }

    throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
  });
}
