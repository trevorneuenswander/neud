import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { CloudActivityRow } from "./cloud-activity-mapper";
import type { ActivitySyncCursor } from "./types";

export type CloudActivityPullPage = {
  /** Rows that passed the accessible-project / global-user filter. */
  rows: CloudActivityRow[];
  /** Raw rows returned by Supabase before client-side filtering. */
  scanned: number;
  /**
   * Cursor of the last raw row in the page so pull can advance past
   * inaccessible projects without stalling (or skipping forever after a later accept).
   */
  pageCursor: ActivitySyncCursor | null;
};

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
    cursor: ActivitySyncCursor | null;
    accessibleProjectIds: string[];
    includeGlobalForUserId: string | null;
    limit: number;
  }): Promise<CloudActivityPullPage> {
    const supabase = await this.cloud.getClient();
    if (!supabase) {
      return { rows: [], scanned: 0, pageCursor: null };
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

    const raw = (data ?? []) as CloudActivityRow[];
    const lastRaw = raw.length > 0 ? raw[raw.length - 1] : null;
    const pageCursor: ActivitySyncCursor | null = lastRaw
      ? { updatedAt: lastRaw.updated_at, id: lastRaw.id }
      : null;

    const accessible = new Set(input.accessibleProjectIds);
    const rows = raw.filter((row) => {
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

    return { rows, scanned: raw.length, pageCursor };
  }
}
