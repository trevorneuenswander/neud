"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudPublishingClient = void 0;
const types_1 = require("./types");
class CloudPublishingClient {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async ping() {
        const { error } = await this.supabase.from("profiles").select("id").limit(1);
        return !error;
    }
    async registerHostedProject(input) {
        const { data, error } = await this.supabase.rpc("register_hosted_project_for_desktop", {
            p_project_id: input.projectId,
            p_slug: input.slug,
            p_name: input.name,
            p_project_type: input.projectType ?? "bag-graphics",
        });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? { ok: false });
    }
    async setOnlinePublishingEnabled(projectId, enabled) {
        const { data, error } = await this.supabase.rpc("set_project_online_publishing_enabled", {
            p_project_id: projectId,
            p_enabled: enabled,
        });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? { ok: false });
    }
    async fetchPublishingSettings(projectId) {
        const { data, error } = await this.supabase
            .from("project_publishing_settings")
            .select("*")
            .eq("project_id", projectId)
            .maybeSingle();
        if (error) {
            throw new Error(error.message);
        }
        return data;
    }
    async acquireLease(projectId, publisherInstanceId) {
        const { data, error } = await this.supabase.rpc("acquire_project_publisher_lease", {
            p_project_id: projectId,
            p_publisher_instance_id: publisherInstanceId,
            p_lease_duration_seconds: types_1.PUBLISHING_LEASE_DURATION_SECONDS,
        });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? { ok: false });
    }
    async renewLease(projectId, publisherInstanceId) {
        const { data, error } = await this.supabase.rpc("renew_project_publisher_lease", {
            p_project_id: projectId,
            p_publisher_instance_id: publisherInstanceId,
            p_lease_duration_seconds: types_1.PUBLISHING_LEASE_DURATION_SECONDS,
        });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? { ok: false });
    }
    async releaseLease(projectId, publisherInstanceId) {
        const { data, error } = await this.supabase.rpc("release_project_publisher_lease", {
            p_project_id: projectId,
            p_publisher_instance_id: publisherInstanceId,
        });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? { ok: false });
    }
    async publishSnapshot(input) {
        const { data, error } = await this.supabase.rpc("publish_project_canonical_snapshot", {
            p_project_id: input.projectId,
            p_publisher_instance_id: input.publisherInstanceId,
            p_contract_version: input.payload.contractVersion,
            p_revision: input.payload.revision,
            p_generated_at: input.payload.generatedAt,
            p_source_mode: input.payload.source.mode,
            p_source_connected: input.payload.source.connected,
            p_payload: input.payload,
            p_payload_hash: input.payloadHash,
            p_max_payload_bytes: types_1.PUBLISHING_MAX_PAYLOAD_BYTES,
        });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? { ok: false });
    }
}
exports.CloudPublishingClient = CloudPublishingClient;
