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

export type CloudDisplayIdentityRow = {
  id: string;
  project_id: string;
  slug: string;
  display_type: string;
  deleted_at: string | null;
  active_revision_id: string | null;
  online_published_revision_id: string | null;
  created_at: string;
  updated_at: string;
};

const DISPLAY_REVISION_PAGE_SIZE = 500;

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

  async fetchFullDisplaysForProject(projectId: string): Promise<CloudDisplayRow[]> {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("displays")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true, nullsFirst: false });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as CloudDisplayRow[];
  }

  async fetchRevisionsForDisplay(displayId: string): Promise<CloudDisplayRevisionRow[]> {
    const result = await this.fetchAllRevisionsForDisplays([displayId]);
    return result.revisions;
  }

  async fetchDisplaysBySlugInProject(input: {
    projectId: string;
    slug: string;
    displayType?: string;
    includeDeleted?: boolean;
  }): Promise<CloudDisplayIdentityRow[]> {
    const supabase = await this.client();
    let query = supabase
      .from("displays")
      .select(
        "id, project_id, slug, display_type, deleted_at, active_revision_id, online_published_revision_id, created_at, updated_at",
      )
      .eq("project_id", input.projectId)
      .eq("slug", input.slug);
    if (!input.includeDeleted) {
      query = query.is("deleted_at", null);
    }
    if (input.displayType) {
      query = query.eq("display_type", input.displayType);
    }
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as CloudDisplayIdentityRow[];
  }

  async fetchDisplaysBySlug(input: {
    slug: string;
    displayType?: string;
    includeDeleted?: boolean;
  }): Promise<CloudDisplayIdentityRow[]> {
    const supabase = await this.client();
    let query = supabase
      .from("displays")
      .select(
        "id, project_id, slug, display_type, deleted_at, active_revision_id, online_published_revision_id, created_at, updated_at",
      )
      .eq("slug", input.slug);
    if (!input.includeDeleted) {
      query = query.is("deleted_at", null);
    }
    if (input.displayType) {
      query = query.eq("display_type", input.displayType);
    }
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as CloudDisplayIdentityRow[];
  }

  async fetchAllRevisionsForDisplays(displayIds: string[]): Promise<{
    revisions: CloudDisplayRevisionRow[];
    pageCount: number;
  }> {
    const uniqueIds = [...new Set(displayIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return { revisions: [], pageCount: 0 };
    }

    const supabase = await this.client();
    const merged = new Map<string, CloudDisplayRevisionRow>();
    let page = 0;
    let pageCount = 0;

    while (true) {
      const from = page * DISPLAY_REVISION_PAGE_SIZE;
      const to = from + DISPLAY_REVISION_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("display_revisions")
        .select("*")
        .in("display_id", uniqueIds)
        .order("version_number", { ascending: true })
        .range(from, to);
      if (error) {
        throw new Error(error.message);
      }

      pageCount += 1;
      const rows = (data ?? []) as CloudDisplayRevisionRow[];
      for (const row of rows) {
        merged.set(row.id, row);
      }

      if (rows.length < DISPLAY_REVISION_PAGE_SIZE) {
        break;
      }
      page += 1;
    }

    const revisions = [...merged.values()].sort((left, right) => {
      if (left.version_number !== right.version_number) {
        return left.version_number - right.version_number;
      }
      return left.created_at.localeCompare(right.created_at);
    });

    return { revisions, pageCount };
  }

  async countRevisionsForDisplay(displayId: string): Promise<number> {
    const supabase = await this.client();
    const { count, error } = await supabase
      .from("display_revisions")
      .select("id", { count: "exact", head: true })
      .eq("display_id", displayId);
    if (error) {
      throw new Error(error.message);
    }
    return count ?? 0;
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
