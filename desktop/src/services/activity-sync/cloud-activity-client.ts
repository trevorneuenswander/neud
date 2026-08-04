import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { CloudActivityRow } from "./cloud-activity-mapper";

export class CloudActivityClient {
  constructor(private readonly cloud: AuthenticatedCloudCoordinator) {}

  async ping(): Promise<boolean> {
    return this.cloud.ping();
  }

  async upsertEvents(rows: CloudActivityRow[]): Promise<{
    uploaded: number;
    errors: string[];
    rejectedEventType: string | null;
  }> {
    if (rows.length === 0) {
      return { uploaded: 0, errors: [], rejectedEventType: null };
    }

    const supabase = await this.cloud.getClient();
    if (!supabase) {
      return { uploaded: 0, errors: ["Cloud session unavailable."], rejectedEventType: null };
    }

    const { data, error } = await supabase.rpc("upsert_activity_events_for_sync", {
      p_events: rows,
    });

    if (error) {
      return { uploaded: 0, errors: [error.message], rejectedEventType: null };
    }

    const result = (data ?? { ok: false }) as {
      ok?: boolean;
      message?: string;
      count?: number;
      event_type?: string;
      code?: string;
    };
    if (!result.ok) {
      const rejectedType = result.event_type?.trim();
      const baseMessage = result.message ?? "Activity upload rejected.";
      const detail = rejectedType ? `${baseMessage} (event_type=${rejectedType})` : baseMessage;
      return { uploaded: 0, errors: [detail], rejectedEventType: rejectedType ?? null };
    }

    return { uploaded: result.count ?? rows.length, errors: [], rejectedEventType: null };
  }

  async fetchChangedSince(input: {
    cursor: { updatedAt: string; id: string } | null;
    accessibleProjectIds: string[];
    includeGlobalForUserId: string | null;
    limit: number;
  }): Promise<CloudActivityRow[]> {
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
    return ((data ?? []) as CloudActivityRow[]).filter((row) => {
      if (input.cursor) {
        const updatedAt = row.updated_at;
        const id = row.id;
        if (updatedAt < input.cursor.updatedAt) return false;
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
