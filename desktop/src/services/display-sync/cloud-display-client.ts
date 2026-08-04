import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";

export type CloudDisplayRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  slug: string;
  display_type: string;
  enabled: boolean;
  refresh_rate_ms: number;
  display_width: number;
  display_height: number;
  is_archived: boolean;
  archived_at: string | null;
  archived_by_user_id: string | null;
  active_revision_id: string | null;
  created_at: string;
  created_by_user_id: string | null;
  updated_at: string;
  updated_by_user_id: string | null;
  deleted_at: string | null;
  sync_version: number;
  source_instance_id: string;
  online_viewer_enabled: boolean;
  online_visibility: "private" | "public";
  online_published_at: string | null;
  online_published_revision_id: string | null;
  online_publish_error: string | null;
  sort_order?: number | null;
};

export type CloudDisplayRevisionRow = {
  id: string;
  display_id: string;
  project_id: string;
  version_number: number;
  html_content: string;
  content_hash: string;
  version_note: string | null;
  created_at: string;
  created_by_user_id: string | null;
  restored_from_revision_id: string | null;
  sync_version: number;
  source_instance_id: string;
};

export type CloudDisplayTombstoneRow = {
  display_id: string;
  project_id: string;
  deleted_at: string;
  deleted_by_user_id: string | null;
  source_instance_id: string;
  processed_at: string | null;
};

export type CloudUpsertResult = {
  uploaded: number;
  errors: string[];
  codes: string[];
};

export class CloudDisplayClient {
  constructor(private readonly cloud: AuthenticatedCloudCoordinator) {}

  private async client() {
    const supabase = await this.cloud.getClient();
    if (!supabase) {
      throw new Error("Cloud session unavailable.");
    }
    return supabase;
  }

  async ping(): Promise<boolean> {
    return this.cloud.ping();
  }

  async upsertDisplays(rows: CloudDisplayRow[]): Promise<CloudUpsertResult> {
    if (rows.length === 0) return { uploaded: 0, errors: [], codes: [] };
    const supabase = await this.client();
    const { error } = await supabase.from("displays").upsert(rows, { onConflict: "id" });
    if (error) {
      return { uploaded: 0, errors: [error.message], codes: [error.code ?? "upsert_failed"] };
    }
    return { uploaded: rows.length, errors: [], codes: [] };
  }

  async upsertRevisions(
    rows: CloudDisplayRevisionRow[],
  ): Promise<CloudUpsertResult> {
    if (rows.length === 0) return { uploaded: 0, errors: [], codes: [] };
    const supabase = await this.client();
    const { error } = await supabase.from("display_revisions").upsert(rows, {
      onConflict: "id",
    });
    if (error) {
      return { uploaded: 0, errors: [error.message], codes: [error.code ?? "upsert_failed"] };
    }
    return { uploaded: rows.length, errors: [], codes: [] };
  }

  async upsertTombstones(
    rows: CloudDisplayTombstoneRow[],
  ): Promise<CloudUpsertResult> {
    if (rows.length === 0) return { uploaded: 0, errors: [], codes: [] };
    const supabase = await this.client();
    const { error } = await supabase.from("display_deletion_tombstones").upsert(rows, {
      onConflict: "display_id",
    });
    if (error) {
      return { uploaded: 0, errors: [error.message], codes: [error.code ?? "upsert_failed"] };
    }
    return { uploaded: rows.length, errors: [], codes: [] };
  }

  async revisionExists(revisionId: string): Promise<boolean> {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("display_revisions")
      .select("id")
      .eq("id", revisionId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return Boolean(data);
  }

  async fetchDisplaysByProject(projectId: string): Promise<
    Array<{
      id: string;
      slug: string;
      enabled: boolean;
      online_viewer_enabled: boolean;
      online_published_revision_id: string | null;
      sync_version: number;
      online_publish_error: string | null;
    }>
  > {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("displays")
      .select(
        "id, slug, enabled, online_viewer_enabled, online_published_revision_id, sync_version, online_publish_error",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as Array<{
      id: string;
      slug: string;
      enabled: boolean;
      online_viewer_enabled: boolean;
      online_published_revision_id: string | null;
      sync_version: number;
      online_publish_error: string | null;
    }>;
  }

  async fetchDisplayById(displayId: string): Promise<{
    id: string;
    enabled: boolean;
    online_viewer_enabled: boolean;
    online_published_revision_id: string | null;
    online_published_at: string | null;
    online_publish_error: string | null;
    sync_version: number;
  } | null> {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("displays")
      .select(
        "id, enabled, online_viewer_enabled, online_published_revision_id, online_published_at, online_publish_error, sync_version",
      )
      .eq("id", displayId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as {
      id: string;
      enabled: boolean;
      online_viewer_enabled: boolean;
      online_published_revision_id: string | null;
      online_published_at: string | null;
      online_publish_error: string | null;
      sync_version: number;
    } | null;
  }

  async upsertRevision(row: CloudDisplayRevisionRow): Promise<CloudUpsertResult> {
    return this.upsertRevisions([row]);
  }

  async upsertDisplay(row: CloudDisplayRow): Promise<CloudUpsertResult> {
    return this.upsertDisplays([row]);
  }

  async fetchTombstonesSince(since: string | null): Promise<CloudDisplayTombstoneRow[]> {
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
    if (error) throw new Error(error.message);
    return (data ?? []) as CloudDisplayTombstoneRow[];
  }

  async countDisplaysByProject(projectId: string): Promise<number> {
    const supabase = await this.client();
    const { count, error } = await supabase
      .from("displays")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async removeProjectDisplayData(
    projectId: string,
  ): Promise<{ displays: number; revisions: number }> {
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
