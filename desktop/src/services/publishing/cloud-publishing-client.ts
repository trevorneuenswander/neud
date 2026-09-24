import type { SupabaseClient } from "@supabase/supabase-js";
import type { NeudPublishedProjectPayload } from "../../publishing/contract";
import type { RpcResultCode } from "./types";
import { PUBLISHING_LEASE_DURATION_SECONDS, PUBLISHING_MAX_PAYLOAD_BYTES } from "./types";

export type PublishingRpcResult = {
  ok: boolean;
  code?: RpcResultCode | string;
  message?: string;
  lease_expires_at?: string;
  owner_instance_id?: string;
  revision?: number;
  payload_hash?: string;
  received_at?: string;
  latest_revision?: number;
  payload_bytes?: number;
  max_payload_bytes?: number;
  online_publishing_enabled?: boolean;
  project_id?: string;
  publisher_instance_id?: string;
};

export class CloudPublishingClient {
  constructor(private readonly supabase: SupabaseClient) {}

  async ping(): Promise<boolean> {
    const { error } = await this.supabase.from("profiles").select("id").limit(1);
    return !error;
  }

  async registerHostedProject(input: {
    projectId: string;
    slug: string;
    name: string;
    projectType?: string;
  }): Promise<PublishingRpcResult> {
    const { data, error } = await this.supabase.rpc("register_hosted_project_for_desktop", {
      p_project_id: input.projectId,
      p_slug: input.slug,
      p_name: input.name,
      p_project_type: input.projectType ?? "bag-graphics",
    });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? { ok: false }) as PublishingRpcResult;
  }

  async setOnlinePublishingEnabled(
    projectId: string,
    enabled: boolean,
  ): Promise<PublishingRpcResult> {
    const { data, error } = await this.supabase.rpc("set_project_online_publishing_enabled", {
      p_project_id: projectId,
      p_enabled: enabled,
    });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? { ok: false }) as PublishingRpcResult;
  }

  async fetchPublishingSettings(projectId: string) {
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

  async fetchPublisherLease(projectId: string) {
    const { data, error } = await this.supabase
      .from("project_publisher_leases")
      .select(
        "project_id, publisher_instance_id, acquired_at, last_heartbeat_at, lease_expires_at, released_at",
      )
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as {
      project_id: string;
      publisher_instance_id: string;
      acquired_at: string | null;
      last_heartbeat_at: string | null;
      lease_expires_at: string | null;
      released_at: string | null;
    } | null;
  }

  async acquireLease(
    projectId: string,
    publisherInstanceId: string,
  ): Promise<PublishingRpcResult> {
    const { data, error } = await this.supabase.rpc("acquire_project_publisher_lease", {
      p_project_id: projectId,
      p_publisher_instance_id: publisherInstanceId,
      p_lease_duration_seconds: PUBLISHING_LEASE_DURATION_SECONDS,
    });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? { ok: false }) as PublishingRpcResult;
  }

  async renewLease(
    projectId: string,
    publisherInstanceId: string,
  ): Promise<PublishingRpcResult> {
    const { data, error } = await this.supabase.rpc("renew_project_publisher_lease", {
      p_project_id: projectId,
      p_publisher_instance_id: publisherInstanceId,
      p_lease_duration_seconds: PUBLISHING_LEASE_DURATION_SECONDS,
    });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? { ok: false }) as PublishingRpcResult;
  }

  async releaseLease(
    projectId: string,
    publisherInstanceId: string,
  ): Promise<PublishingRpcResult> {
    const { data, error } = await this.supabase.rpc("release_project_publisher_lease", {
      p_project_id: projectId,
      p_publisher_instance_id: publisherInstanceId,
    });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? { ok: false }) as PublishingRpcResult;
  }

  async fetchLatestCanonicalSnapshot(projectId: string) {
    const { data, error } = await this.supabase
      .from("project_canonical_snapshots")
      .select("revision, payload_hash")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as { revision: number; payload_hash: string } | null;
  }

  async publishSnapshot(input: {
    projectId: string;
    publisherInstanceId: string;
    payload: NeudPublishedProjectPayload;
    payloadHash: string;
  }): Promise<PublishingRpcResult> {
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
      p_max_payload_bytes: PUBLISHING_MAX_PAYLOAD_BYTES,
    });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? { ok: false }) as PublishingRpcResult;
  }
}
