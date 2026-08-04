"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppSettingsRepository = void 0;
class AppSettingsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    get(key, fallback) {
        const row = this.db
            .prepare("SELECT value_json FROM app_settings WHERE key = ?")
            .get(key);
        if (!row)
            return fallback;
        try {
            return JSON.parse(row.value_json);
        }
        catch {
            return fallback;
        }
    }
    set(key, value) {
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`)
            .run(key, JSON.stringify(value), now);
    }
}
exports.AppSettingsRepository = AppSettingsRepository;
