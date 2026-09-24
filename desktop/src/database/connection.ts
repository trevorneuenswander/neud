import fs from "fs";
import path from "path";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import type { AppPaths } from "../services/app-paths";
import { runMigrations } from "./migrate";

type BindParams = Record<string, unknown> | unknown[];

const sqlitePersistMetrics = {
  persistCount: 0,
};

export function getSqlitePersistMetrics(): typeof sqlitePersistMetrics {
  return { ...sqlitePersistMetrics };
}

export type PreparedStatement = {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): void;
};

export class LocalDatabase {
  private deferPersist = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPending = false;

  private constructor(
    private readonly db: SqlJsDatabase,
    private readonly filePath: string,
  ) {}

  static async open(paths: AppPaths): Promise<LocalDatabase> {
    fs.mkdirSync(paths.data, { recursive: true });
    const wasmPath = resolveSqlWasmPath();
    const SQL = await initSqlJs({
      locateFile: (fileName) => {
        if (fileName === "sql-wasm.wasm") {
          return wasmPath;
        }

        return path.join(path.dirname(wasmPath), fileName);
      },
    });
    const filePath = paths.databaseFile;
    const bytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined;
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    db.exec("PRAGMA foreign_keys = ON");
    const wrapper = new LocalDatabase(db, filePath);
    runMigrations(wrapper, paths);
    return wrapper;
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.persistIfNeeded();
  }

  transaction<T>(operation: () => T): T {
    this.deferPersist = true;

    try {
      this.db.exec("BEGIN");
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // ignore rollback failures
      }
      throw error;
    } finally {
      this.deferPersist = false;
      this.persist();
    }
  }

  prepare(sql: string): PreparedStatement {
    return {
      all: (...params: unknown[]) => this.all(sql, params),
      get: (...params: unknown[]) => this.get(sql, params),
      run: (...params: unknown[]) => {
        this.run(sql, params);
      },
    };
  }

  close(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist();
    this.db.close();
  }

  private all(sql: string, params: unknown[]): Record<string, unknown>[] {
    const stmt = this.db.prepare(sql);
    this.bind(stmt, params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  private get(sql: string, params: unknown[]): Record<string, unknown> | undefined {
    const rows = this.all(sql, params);
    return rows[0];
  }

  private run(sql: string, params: unknown[]): void {
    const stmt = this.db.prepare(sql);
    this.bind(stmt, params);
    stmt.step();
    stmt.free();
    this.persistIfNeeded();
  }

  private bind(stmt: ReturnType<SqlJsDatabase["prepare"]>, params: unknown[]) {
    if (params.length === 0) return;
    const first = params[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      stmt.bind(first as BindParams);
      return;
    }
    stmt.bind(params as BindParams);
  }

  private persistIfNeeded() {
    if (this.deferPersist) {
      return;
    }
    this.schedulePersist();
  }

  private schedulePersist() {
    this.persistPending = true;
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.persistPending) {
        this.persistPending = false;
        this.persist();
      }
    }, 100);
  }

  private persist() {
    sqlitePersistMetrics.persistCount += 1;
    const data = this.db.export();
    fs.writeFileSync(this.filePath, Buffer.from(data));
  }
}

export async function openLocalDatabase(paths: AppPaths): Promise<LocalDatabase> {
  return LocalDatabase.open(paths);
}

export function closeLocalDatabase(db: LocalDatabase | null) {
  db?.close();
}

function resolveSqlWasmPath(): string {
  const candidates = [
    process.resourcesPath
      ? path.resolve(
          process.resourcesPath,
          "database",
          "assets",
          "sql-wasm.wasm",
        )
      : null,
    path.resolve(__dirname, "assets", "sql-wasm.wasm"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      "sql-wasm.wasm was not found.",
      "Run `npm run build -w @neud/desktop` to copy runtime assets.",
      "Attempted paths:",
      ...candidates.map((candidate) => `  - ${candidate}`),
    ].join("\n"),
  );
}
