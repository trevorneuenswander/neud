export type ViewerBundleRpcRow = {
  ok?: boolean;
  code?: string;
  project?: {
    id?: string;
    slug?: string;
    name?: string;
  };
  display?: {
    id?: string;
    slug?: string;
    name?: string;
    description?: string | null;
    display_width?: number | null;
    display_height?: number | null;
    online_visibility?: "private" | "public";
    online_published_at?: string | null;
    published_revision_id?: string | null;
    refresh_rate_ms?: number | null;
  };
  html_content?: string;
  canonical_payload?: Record<string, unknown> | null;
  canonical_revision?: number | null;
  published_at?: string | null;
  stale?: boolean;
  source_offline?: boolean;
  publisher_online?: boolean;
  source_connected?: boolean;
  source_mode?: string | null;
  data_stale?: boolean;
  stale_reason?: string | null;
  canonical_data_present?: boolean;
  snapshot_received_at?: string | null;
  publisher_last_heartbeat_at?: string | null;
};

export type ParsedViewerBundle =
  | {
      ok: true;
      code: "viewer_ready";
      project: NonNullable<ViewerBundleRpcRow["project"]>;
      display: NonNullable<ViewerBundleRpcRow["display"]> & {
        name: string;
        slug: string;
      };
      htmlContent: string;
      revisionKey: string;
      canonicalPayload: Record<string, unknown> | null;
      canonicalRevision: number | null;
      stale: boolean;
      sourceOffline: boolean;
      publisherOnline: boolean;
      sourceConnected: boolean;
      sourceMode: string | null;
      dataStale: boolean;
      staleReason: string | null;
      canonicalDataPresent: boolean;
      snapshotReceivedAt: string | null;
      publisherLastHeartbeatAt: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      rpcErrorCode?: string | null;
    };

export type ViewerBundleDiagnosticSummary = {
  rpcSuccess: boolean;
  rpcErrorCategory: string | null;
  topLevelKeys: string[];
  code: string | null;
  projectSlug: string | null;
  displaySlug: string | null;
  publishedRevisionId: string | null;
  htmlPresent: boolean;
  htmlLength: number;
  canonicalPayloadPresent: boolean;
  canonicalRevision: number | null;
  stale: boolean | null;
  sourceOffline: boolean | null;
  publisherOnline: boolean | null;
  sourceConnected: boolean | null;
  sourceMode: string | null;
  canonicalDataPresent: boolean | null;
  dataStale: boolean | null;
  staleReason: string | null;
  snapshotReceivedAt: string | null;
  publisherLastHeartbeatAt: string | null;
  sessionAvailable: boolean;
  membershipAccess: "granted" | "denied" | "anonymous" | "unknown";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseViewerBundleRpcResult(
  data: unknown,
  rpcError?: { message?: string; code?: string } | null,
): ParsedViewerBundle {
  if (rpcError) {
    return {
      ok: false,
      code: categorizeRpcError(rpcError),
      message: resolveViewerLoadErrorMessage(categorizeRpcError(rpcError)),
      rpcErrorCode: rpcError.code ?? null,
    };
  }

  if (!isRecord(data)) {
    return {
      ok: false,
      code: "invalid_bundle",
      message: resolveViewerLoadErrorMessage("invalid_bundle"),
    };
  }

  const row = data as ViewerBundleRpcRow;
  if (!row.ok) {
    const code = typeof row.code === "string" ? row.code : "not_found";
    return {
      ok: false,
      code,
      message: resolveViewerLoadErrorMessage(code),
    };
  }

  if (row.code !== "viewer_ready") {
    return {
      ok: false,
      code: "invalid_bundle",
      message: resolveViewerLoadErrorMessage("invalid_bundle"),
    };
  }

  const htmlContent = typeof row.html_content === "string" ? row.html_content : "";
  if (!htmlContent.trim()) {
    return {
      ok: false,
      code: "not_published",
      message: resolveViewerLoadErrorMessage("not_published"),
    };
  }

  const display = row.display;
  if (!display?.slug || !display.name) {
    return {
      ok: false,
      code: "invalid_bundle",
      message: resolveViewerLoadErrorMessage("invalid_bundle"),
    };
  }

  const canonicalPayload =
    row.canonical_payload && isRecord(row.canonical_payload) ? row.canonical_payload : null;

  return {
    ok: true,
    code: "viewer_ready",
    project: row.project ?? { slug: display.slug },
    display: {
      ...display,
      slug: display.slug,
      name: display.name,
    },
    htmlContent,
    revisionKey: resolveViewerRevisionKey(row),
    canonicalPayload,
    canonicalRevision:
      typeof row.canonical_revision === "number" ? row.canonical_revision : null,
    stale: Boolean(row.data_stale ?? row.stale),
    sourceOffline: Boolean(row.source_offline),
    publisherOnline: Boolean(row.publisher_online),
    sourceConnected: Boolean(row.source_connected),
    sourceMode: typeof row.source_mode === "string" ? row.source_mode : null,
    dataStale: Boolean(row.data_stale ?? row.stale),
    staleReason: typeof row.stale_reason === "string" ? row.stale_reason : null,
    canonicalDataPresent: Boolean(row.canonical_data_present),
    snapshotReceivedAt:
      typeof row.snapshot_received_at === "string" ? row.snapshot_received_at : null,
    publisherLastHeartbeatAt:
      typeof row.publisher_last_heartbeat_at === "string"
        ? row.publisher_last_heartbeat_at
        : null,
  };
}

export function resolveViewerRevisionKey(row: ViewerBundleRpcRow): string {
  const revisionId = row.display?.published_revision_id;
  if (typeof revisionId === "string" && revisionId.length > 0) {
    return revisionId;
  }
  if (typeof row.published_at === "string" && row.published_at.length > 0) {
    return `published_at:${row.published_at}`;
  }
  if (typeof row.html_content === "string" && row.html_content.length > 0) {
    return `html:${row.html_content.length}`;
  }
  return "unknown";
}

export function categorizeRpcError(error: { message?: string; code?: string }): string {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  if (code.includes("pgrst") || message.includes("column") || message.includes("field")) {
    return "temporary_cloud_error";
  }
  if (message.includes("jwt") || message.includes("auth") || code === "401") {
    return "authentication_required";
  }
  return "temporary_cloud_error";
}

export function resolveViewerLoadErrorMessage(code: string | undefined): string {
  switch (code) {
    case "authentication_required":
      return "Sign in to view this private display.";
    case "not_found":
      return "This display is unavailable or you do not have access.";
    case "not_published":
      return "This display is enabled for online viewing but has not been published yet.";
    case "invalid_bundle":
      return "The online viewer bundle was invalid.";
    case "temporary_cloud_error":
      return "The online viewer is temporarily unavailable. Try again shortly.";
    case "data_unavailable":
      return "Display data is not available yet.";
    default:
      return "Unable to load the online viewer.";
  }
}

export function summarizeViewerBundleDiagnostic(input: {
  rpcData: unknown;
  rpcError?: { message?: string; code?: string } | null;
  sessionAvailable: boolean;
  membershipAccess?: "granted" | "denied" | "anonymous" | "unknown";
}): ViewerBundleDiagnosticSummary {
  const parsed = parseViewerBundleRpcResult(input.rpcData, input.rpcError);
  const row = isRecord(input.rpcData) ? (input.rpcData as ViewerBundleRpcRow) : null;
  const canonicalPayload =
    row?.canonical_payload && isRecord(row.canonical_payload) ? row.canonical_payload : null;

  return {
    rpcSuccess: parsed.ok,
    rpcErrorCategory: parsed.ok ? null : parsed.code,
    topLevelKeys: row ? Object.keys(row) : [],
    code: row?.code ?? (input.rpcError ? categorizeRpcError(input.rpcError) : null),
    projectSlug: row?.project?.slug ?? null,
    displaySlug: row?.display?.slug ?? null,
    publishedRevisionId: row?.display?.published_revision_id ?? null,
    htmlPresent: Boolean(row?.html_content && row.html_content.length > 0),
    htmlLength: typeof row?.html_content === "string" ? row.html_content.length : 0,
    canonicalPayloadPresent: Boolean(
      row?.canonical_payload &&
        isRecord(row.canonical_payload) &&
        Object.keys(row.canonical_payload).length > 0,
    ),
    canonicalRevision:
      typeof row?.canonical_revision === "number" ? row.canonical_revision : null,
    stale: typeof row?.stale === "boolean" ? row.stale : null,
    sourceOffline: typeof row?.source_offline === "boolean" ? row.source_offline : null,
    publisherOnline: typeof row?.publisher_online === "boolean" ? row.publisher_online : null,
    sourceConnected: typeof row?.source_connected === "boolean" ? row.source_connected : null,
    sourceMode: typeof row?.source_mode === "string" ? row.source_mode : null,
    dataStale: typeof row?.data_stale === "boolean" ? row.data_stale : null,
    staleReason: typeof row?.stale_reason === "string" ? row.stale_reason : null,
    canonicalDataPresent:
      typeof row?.canonical_data_present === "boolean" ? row.canonical_data_present : null,
    snapshotReceivedAt:
      typeof row?.snapshot_received_at === "string" ? row.snapshot_received_at : null,
    publisherLastHeartbeatAt:
      typeof row?.publisher_last_heartbeat_at === "string"
        ? row.publisher_last_heartbeat_at
        : null,
    sessionAvailable: input.sessionAvailable,
    membershipAccess: input.membershipAccess ?? "unknown",
  };
}

export function logViewerBundleDiagnostic(
  label: string,
  summary: ViewerBundleDiagnosticSummary,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(label, summary);
}
