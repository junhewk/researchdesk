import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { runMigrations } from "./migrate";

function resolveDataDir(): string {
  if (process.env.REVIEWER_DATA_DIR) {
    return path.resolve(process.env.REVIEWER_DATA_DIR);
  }

  return path.resolve(
    path.join(/* turbopackIgnore: true */ process.cwd(), "data"),
  );
}

const globalKey = "__REVIEWER_AGENT_DB__" as const;
const g = globalThis as unknown as Record<string, Database.Database | undefined>;

export function getDb(): Database.Database {
  if (!g[globalKey]) {
    const dataDir = resolveDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "reviewer.db");

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    runMigrations(db);
    g[globalKey] = db;
  }
  return g[globalKey]!;
}
