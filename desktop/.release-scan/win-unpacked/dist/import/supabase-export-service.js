"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseExportService = void 0;
const import_normalizer_1 = require("./import-normalizer");
class SupabaseExportService {
    cloud;
    constructor(cloud) {
        this.cloud = cloud;
    }
    async exportForUser(input) {
        const supabase = await this.cloud.getClient();
        if (!supabase) {
            throw new Error("Cloud session required for Supabase import preview.");
        }
        const projectIds = await this.loadAccessibleProjectIds(supabase, input.userId, input.role);
        if (projectIds.length === 0) {
            return (0, import_normalizer_1.buildImportPackage)({
                projects: [],
                engines: [],
                settings: [],
                scraperSources: [],
                snapshots: [],
            });
        }
        const { data: projects, error: projectsError } = await supabase
            .from("projects")
            .select("id, project_number, name, slug, description, project_type, status, display_token, theme, logo_url, primary_color, secondary_color, icon, settings, metadata, archived_at, created_at, updated_at")
            .in("id", projectIds)
            .order("project_number", { ascending: true });
        if (projectsError) {
            throw toExportError("Unable to load cloud projects.", projectsError);
        }
        const { data: engines, error: enginesError } = await supabase
            .from("data_engines")
            .select("id, project_id, name, engine_key, engine_type, enabled, desired_state, execution_mode, config, created_at, updated_at")
            .in("project_id", projectIds)
            .order("created_at", { ascending: true });
        if (enginesError) {
            throw toExportError("Unable to load cloud Data Engines.", enginesError);
        }
        const engineIds = (engines ?? []).map((engine) => engine.id);
        let settings = [];
        let scraperSources = [];
        let snapshots = [];
        if (engineIds.length > 0) {
            settings = await this.loadSettings(supabase, engineIds);
            scraperSources = await this.loadScraperSources(supabase, engineIds);
            snapshots = await this.loadLatestSnapshots(supabase, engineIds);
        }
        return (0, import_normalizer_1.buildImportPackage)({
            projects: projects ?? [],
            engines: engines ?? [],
            settings,
            scraperSources,
            snapshots,
        });
    }
    async loadAccessibleProjectIds(supabase, userId, role) {
        if (!supabase) {
            return [];
        }
        const platformAdmin = role === "owner" || role === "admin";
        if (platformAdmin) {
            const { data, error } = await supabase.from("projects").select("id");
            if (error) {
                throw toExportError("Unable to list cloud projects.", error);
            }
            return (data ?? []).map((row) => row.id);
        }
        const { data, error } = await supabase
            .from("project_members")
            .select("project_id")
            .eq("user_id", userId);
        if (error) {
            throw toExportError("Unable to load accessible cloud projects.", error);
        }
        return (data ?? []).map((row) => row.project_id);
    }
    async loadSettings(supabase, engineIds) {
        const { data, error } = await supabase
            .from("webpage_scraper_settings")
            .select("*")
            .in("engine_id", engineIds);
        if (error) {
            throw toExportError("Unable to load scraper settings.", error);
        }
        return data ?? [];
    }
    async loadScraperSources(supabase, engineIds) {
        const { data, error } = await supabase
            .from("webpage_scraper_sources")
            .select("*")
            .in("engine_id", engineIds);
        if (error) {
            throw toExportError("Unable to load scraper sources.", error);
        }
        return data ?? [];
    }
    async loadLatestSnapshots(supabase, engineIds) {
        const { data, error } = await supabase
            .from("data_engine_snapshots")
            .select("*")
            .in("engine_id", engineIds)
            .order("created_at", { ascending: false });
        if (error) {
            throw toExportError("Unable to load engine snapshots.", error);
        }
        return data ?? [];
    }
}
exports.SupabaseExportService = SupabaseExportService;
function toExportError(message, error) {
    return new Error(`${message} ${error.message ?? ""}`.trim());
}
