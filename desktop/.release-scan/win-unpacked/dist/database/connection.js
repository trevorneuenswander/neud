"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDatabase = void 0;
exports.openLocalDatabase = openLocalDatabase;
exports.closeLocalDatabase = closeLocalDatabase;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sql_js_1 = __importDefault(require("sql.js"));
const migrate_1 = require("./migrate");
class LocalDatabase {
    db;
    filePath;
    deferPersist = false;
    constructor(db, filePath) {
        this.db = db;
        this.filePath = filePath;
    }
    static async open(paths) {
        fs_1.default.mkdirSync(paths.data, { recursive: true });
        const wasmPath = resolveSqlWasmPath();
        const SQL = await (0, sql_js_1.default)({
            locateFile: (fileName) => {
                if (fileName === "sql-wasm.wasm") {
                    return wasmPath;
                }
                return path_1.default.join(path_1.default.dirname(wasmPath), fileName);
            },
        });
        const filePath = paths.databaseFile;
        const bytes = fs_1.default.existsSync(filePath) ? fs_1.default.readFileSync(filePath) : undefined;
        const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
        db.exec("PRAGMA foreign_keys = ON");
        const wrapper = new LocalDatabase(db, filePath);
        (0, migrate_1.runMigrations)(wrapper, paths);
        return wrapper;
    }
    exec(sql) {
        this.db.exec(sql);
        this.persistIfNeeded();
    }
    transaction(operation) {
        this.deferPersist = true;
        try {
            this.db.exec("BEGIN");
            const result = operation();
            this.db.exec("COMMIT");
            return result;
        }
        catch (error) {
            try {
                this.db.exec("ROLLBACK");
            }
            catch {
                // ignore rollback failures
            }
            throw error;
        }
        finally {
            this.deferPersist = false;
            this.persist();
        }
    }
    prepare(sql) {
        return {
            all: (...params) => this.all(sql, params),
            get: (...params) => this.get(sql, params),
            run: (...params) => {
                this.run(sql, params);
            },
        };
    }
    close() {
        this.persist();
        this.db.close();
    }
    all(sql, params) {
        const stmt = this.db.prepare(sql);
        this.bind(stmt, params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }
    get(sql, params) {
        const rows = this.all(sql, params);
        return rows[0];
    }
    run(sql, params) {
        const stmt = this.db.prepare(sql);
        this.bind(stmt, params);
        stmt.step();
        stmt.free();
        this.persistIfNeeded();
    }
    bind(stmt, params) {
        if (params.length === 0)
            return;
        const first = params[0];
        if (first && typeof first === "object" && !Array.isArray(first)) {
            stmt.bind(first);
            return;
        }
        stmt.bind(params);
    }
    persistIfNeeded() {
        if (!this.deferPersist) {
            this.persist();
        }
    }
    persist() {
        const data = this.db.export();
        fs_1.default.writeFileSync(this.filePath, Buffer.from(data));
    }
}
exports.LocalDatabase = LocalDatabase;
async function openLocalDatabase(paths) {
    return LocalDatabase.open(paths);
}
function closeLocalDatabase(db) {
    db?.close();
}
function resolveSqlWasmPath() {
    const candidates = [
        process.resourcesPath
            ? path_1.default.resolve(process.resourcesPath, "database", "assets", "sql-wasm.wasm")
            : null,
        path_1.default.resolve(__dirname, "assets", "sql-wasm.wasm"),
    ].filter((candidate) => Boolean(candidate));
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error([
        "sql-wasm.wasm was not found.",
        "Run `npm run build -w @neud/desktop` to copy runtime assets.",
        "Attempted paths:",
        ...candidates.map((candidate) => `  - ${candidate}`),
    ].join("\n"));
}
