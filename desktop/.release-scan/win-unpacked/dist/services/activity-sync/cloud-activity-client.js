"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudActivityClient = void 0;
class CloudActivityClient {
    cloud;
    constructor(cloud) {
        this.cloud = cloud;
    }
    async ping() {
        return this.cloud.ping();
    }
    async upsertEvents(rows) {
        if (rows.length === 0) {
            return { uploaded: 0, errors: [] };
        }
        const supabase = await this.cloud.getClient();
        if (!supabase) {
            return { uploaded: 0, errors: ["Cloud session unavailable."] };
        }
        const { data, error } = await supabase.rpc("upsert_activity_events_for_sync", {
            p_events: rows,
        });
        if (error) {
            return { uploaded: 0, errors: [error.message] };
        }
        const result = (data ?? { ok: false });
        if (!result.ok) {
            return { uploaded: 0, errors: [result.message ?? "Activity upload rejected."] };
        }
        return { uploaded: result.count ?? rows.length, errors: [] };
    }
    async fetchChangedSince(input) {
        const supabase = await this.cloud.getClient();
        if (!supabase) {
            return [];
        }
        let query = supabase
            .from("activity_events")
            .select("*")
            .is("deleted_at", null)
            .order("updated_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(input.limit);
        if (input.cursor?.updatedAt) {
            query = query.gte("updated_at", input.cursor.updatedAt);
        }
        const { data, error } = await query;
        if (error) {
            throw new Error(error.message);
        }
        const accessible = new Set(input.accessibleProjectIds);
        return (data ?? []).filter((row) => {
            if (input.cursor) {
                const updatedAt = row.updated_at;
                const id = row.id;
                if (updatedAt < input.cursor.updatedAt)
                    return false;
                if (updatedAt === input.cursor.updatedAt && id <= input.cursor.id) {
                    return false;
                }
            }
            if (row.project_id) {
                return accessible.has(row.project_id);
            }
            if (row.user_id && input.includeGlobalForUserId) {
                return row.user_id === input.includeGlobalForUserId;
            }
            return input.accessibleProjectIds.length > 0;
        });
    }
}
exports.CloudActivityClient = CloudActivityClient;
