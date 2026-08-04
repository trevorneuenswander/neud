"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudDisplayClient = void 0;
class CloudDisplayClient {
    cloud;
    constructor(cloud) {
        this.cloud = cloud;
    }
    async client() {
        const supabase = await this.cloud.getClient();
        if (!supabase) {
            throw new Error("Cloud session unavailable.");
        }
        return supabase;
    }
    async ping() {
        return this.cloud.ping();
    }
    async upsertDisplays(rows) {
        if (rows.length === 0)
            return { uploaded: 0, errors: [] };
        const supabase = await this.client();
        const { error } = await supabase.from("displays").upsert(rows, { onConflict: "id" });
        if (error)
            return { uploaded: 0, errors: [error.message] };
        return { uploaded: rows.length, errors: [] };
    }
    async upsertRevisions(rows) {
        if (rows.length === 0)
            return { uploaded: 0, errors: [] };
        const supabase = await this.client();
        const { error } = await supabase.from("display_revisions").upsert(rows, {
            onConflict: "id",
        });
        if (error)
            return { uploaded: 0, errors: [error.message] };
        return { uploaded: rows.length, errors: [] };
    }
    async upsertTombstones(rows) {
        if (rows.length === 0)
            return { uploaded: 0, errors: [] };
        const supabase = await this.client();
        const { error } = await supabase.from("display_deletion_tombstones").upsert(rows, {
            onConflict: "display_id",
        });
        if (error)
            return { uploaded: 0, errors: [error.message] };
        return { uploaded: rows.length, errors: [] };
    }
    async fetchTombstonesSince(since) {
        const supabase = await this.client();
        let query = supabase
            .from("display_deletion_tombstones")
            .select("*")
            .order("deleted_at", { ascending: true })
            .limit(100);
        if (since) {
            query = query.gt("deleted_at", since);
        }
        const { data, error } = await query;
        if (error)
            throw new Error(error.message);
        return (data ?? []);
    }
    async countDisplaysByProject(projectId) {
        const supabase = await this.client();
        const { count, error } = await supabase
            .from("displays")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId);
        if (error)
            throw new Error(error.message);
        return count ?? 0;
    }
    async removeProjectDisplayData(projectId) {
        const supabase = await this.client();
        const revisionResult = await supabase
            .from("display_revisions")
            .delete({ count: "exact" })
            .eq("project_id", projectId);
        if (revisionResult.error) {
            throw new Error(revisionResult.error.message);
        }
        const displayResult = await supabase
            .from("displays")
            .delete({ count: "exact" })
            .eq("project_id", projectId);
        if (displayResult.error) {
            throw new Error(displayResult.error.message);
        }
        return {
            displays: displayResult.count ?? 0,
            revisions: revisionResult.count ?? 0,
        };
    }
}
exports.CloudDisplayClient = CloudDisplayClient;
