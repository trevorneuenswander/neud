import type { LocalDatabase } from "../database/connection";

export type ProjectDisplayCodeRow = {
  displayId: string;
  projectId: string;
  slug: string;
  description: string | null;
  sourceType: "built-in" | "project-html";
  draftHtml: string | null;
  draftCss: string | null;
  draftJavascript: string | null;
  publishedRevisionId: string | null;
  draftSavedAt: string | null;
  archived: boolean;
  archivedAt: string | null;
  archivedByUserId: string | null;
  onlineViewerEnabled: boolean;
  onlineVisibility: "private" | "public";
  onlinePublishedAt: string | null;
  onlinePublishedRevisionId: string | null;
  onlinePublishError: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export class ProjectDisplayCodeRepository {
  constructor(private readonly db: LocalDatabase) {}

  getByDisplayId(displayId: string): ProjectDisplayCodeRow | null {
    const row = this.db
      .prepare("SELECT * FROM project_display_code WHERE display_id = ?")
      .get(displayId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  getBySlug(projectId: string, slug: string): ProjectDisplayCodeRow | null {
    const row = this.db
      .prepare(
        "SELECT * FROM project_display_code WHERE project_id = ? AND slug = ?",
      )
      .get(projectId, slug) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  listByProject(projectId: string, includeArchived = false): ProjectDisplayCodeRow[] {
    const sql = includeArchived
      ? "SELECT * FROM project_display_code WHERE project_id = ? ORDER BY slug ASC"
      : "SELECT * FROM project_display_code WHERE project_id = ? AND archived = 0 ORDER BY slug ASC";
    const rows = this.db.prepare(sql).all(projectId) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  upsert(input: {
    displayId: string;
    projectId: string;
    slug: string;
    description?: string | null;
    sourceType?: "built-in" | "project-html";
    draftHtml?: string | null;
    draftCss?: string | null;
    draftJavascript?: string | null;
    publishedRevisionId?: string | null;
    draftSavedAt?: string | null;
    archived?: boolean;
    archivedAt?: string | null;
    archivedByUserId?: string | null;
    onlineViewerEnabled?: boolean;
    onlineVisibility?: "private" | "public";
    onlinePublishedAt?: string | null;
    onlinePublishedRevisionId?: string | null;
    onlinePublishError?: string | null;
    updatedBy?: string | null;
  }): ProjectDisplayCodeRow {
    const now = new Date().toISOString();
    const existing = this.getByDisplayId(input.displayId);

    if (!existing) {
      const record: ProjectDisplayCodeRow = {
        displayId: input.displayId,
        projectId: input.projectId,
        slug: input.slug,
        description: input.description ?? null,
        sourceType: input.sourceType ?? "project-html",
        draftHtml: input.draftHtml ?? null,
        draftCss: input.draftCss ?? null,
        draftJavascript: input.draftJavascript ?? null,
        publishedRevisionId: input.publishedRevisionId ?? null,
        draftSavedAt: input.draftSavedAt ?? null,
        archived: input.archived ?? false,
        archivedAt: input.archivedAt ?? null,
        archivedByUserId: input.archivedByUserId ?? null,
        onlineViewerEnabled: input.onlineViewerEnabled ?? false,
        onlineVisibility: input.onlineVisibility ?? "private",
        onlinePublishedAt: input.onlinePublishedAt ?? null,
        onlinePublishedRevisionId: input.onlinePublishedRevisionId ?? null,
        onlinePublishError: input.onlinePublishError ?? null,
        updatedAt: now,
        updatedBy: input.updatedBy ?? null,
      };
      this.db
        .prepare(
          `INSERT INTO project_display_code (
            display_id, project_id, slug, description, source_type,
            draft_html, draft_css, draft_javascript, published_revision_id,
            draft_saved_at, archived, archived_at, archived_by_user_id,
            online_viewer_enabled, online_visibility, online_published_at,
            online_published_revision_id, online_publish_error,
            updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.displayId,
          record.projectId,
          record.slug,
          record.description,
          record.sourceType,
          record.draftHtml,
          record.draftCss,
          record.draftJavascript,
          record.publishedRevisionId,
          record.draftSavedAt,
          record.archived ? 1 : 0,
          record.archivedAt,
          record.archivedByUserId,
          record.onlineViewerEnabled ? 1 : 0,
          record.onlineVisibility,
          record.onlinePublishedAt,
          record.onlinePublishedRevisionId,
          record.onlinePublishError,
          record.updatedAt,
          record.updatedBy,
        );
      return record;
    }

    const next: ProjectDisplayCodeRow = {
      ...existing,
      slug: input.slug ?? existing.slug,
      description:
        input.description !== undefined ? input.description : existing.description,
      sourceType: input.sourceType ?? existing.sourceType,
      draftHtml: input.draftHtml !== undefined ? input.draftHtml : existing.draftHtml,
      draftCss: input.draftCss !== undefined ? input.draftCss : existing.draftCss,
      draftJavascript:
        input.draftJavascript !== undefined
          ? input.draftJavascript
          : existing.draftJavascript,
      publishedRevisionId:
        input.publishedRevisionId !== undefined
          ? input.publishedRevisionId
          : existing.publishedRevisionId,
      draftSavedAt:
        input.draftSavedAt !== undefined ? input.draftSavedAt : existing.draftSavedAt,
      archived: input.archived ?? existing.archived,
      archivedAt:
        input.archivedAt !== undefined ? input.archivedAt : existing.archivedAt,
      archivedByUserId:
        input.archivedByUserId !== undefined
          ? input.archivedByUserId
          : existing.archivedByUserId,
      onlineViewerEnabled:
        input.onlineViewerEnabled !== undefined
          ? input.onlineViewerEnabled
          : existing.onlineViewerEnabled,
      onlineVisibility: input.onlineVisibility ?? existing.onlineVisibility,
      onlinePublishedAt:
        input.onlinePublishedAt !== undefined
          ? input.onlinePublishedAt
          : existing.onlinePublishedAt,
      onlinePublishedRevisionId:
        input.onlinePublishedRevisionId !== undefined
          ? input.onlinePublishedRevisionId
          : existing.onlinePublishedRevisionId,
      onlinePublishError:
        input.onlinePublishError !== undefined
          ? input.onlinePublishError
          : existing.onlinePublishError,
      updatedAt: now,
      updatedBy: input.updatedBy ?? existing.updatedBy,
    };

    this.db
      .prepare(
        `UPDATE project_display_code SET
          slug = ?,
          description = ?,
          source_type = ?,
          draft_html = ?,
          draft_css = ?,
          draft_javascript = ?,
          published_revision_id = ?,
          draft_saved_at = ?,
          archived = ?,
          archived_at = ?,
          archived_by_user_id = ?,
          online_viewer_enabled = ?,
          online_visibility = ?,
          online_published_at = ?,
          online_published_revision_id = ?,
          online_publish_error = ?,
          updated_at = ?,
          updated_by = ?
        WHERE display_id = ?`,
      )
      .run(
        next.slug,
        next.description,
        next.sourceType,
        next.draftHtml,
        next.draftCss,
        next.draftJavascript,
        next.publishedRevisionId,
        next.draftSavedAt,
        next.archived ? 1 : 0,
        next.archivedAt,
        next.archivedByUserId,
        next.onlineViewerEnabled ? 1 : 0,
        next.onlineVisibility,
        next.onlinePublishedAt,
        next.onlinePublishedRevisionId,
        next.onlinePublishError,
        next.updatedAt,
        next.updatedBy,
        next.displayId,
      );

    return next;
  }

  deleteByDisplayId(displayId: string): boolean {
    this.db.prepare("DELETE FROM project_display_code WHERE display_id = ?").run(displayId);
    return true;
  }
}

function mapRow(row: Record<string, unknown>): ProjectDisplayCodeRow {
  return {
    displayId: String(row.display_id),
    projectId: String(row.project_id),
    slug: String(row.slug),
    description: typeof row.description === "string" ? row.description : null,
    sourceType: row.source_type === "project-html" ? "project-html" : "built-in",
    draftHtml: typeof row.draft_html === "string" ? row.draft_html : null,
    draftCss: typeof row.draft_css === "string" ? row.draft_css : null,
    draftJavascript:
      typeof row.draft_javascript === "string" ? row.draft_javascript : null,
    publishedRevisionId:
      typeof row.published_revision_id === "string"
        ? row.published_revision_id
        : null,
    draftSavedAt: typeof row.draft_saved_at === "string" ? row.draft_saved_at : null,
    archived: row.archived === 1,
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    archivedByUserId:
      typeof row.archived_by_user_id === "string" ? row.archived_by_user_id : null,
    onlineViewerEnabled: row.online_viewer_enabled === 1 || row.online_viewer_enabled === true,
    onlineVisibility:
      row.online_visibility === "public" ? "public" : "private",
    onlinePublishedAt:
      typeof row.online_published_at === "string" ? row.online_published_at : null,
    onlinePublishedRevisionId:
      typeof row.online_published_revision_id === "string"
        ? row.online_published_revision_id
        : null,
    onlinePublishError:
      typeof row.online_publish_error === "string" ? row.online_publish_error : null,
    updatedAt: String(row.updated_at),
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}
