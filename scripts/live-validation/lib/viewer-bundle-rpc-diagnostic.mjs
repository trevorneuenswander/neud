import { sanitizeError } from "./sanitize.mjs";

export const VIEWER_BUNDLE_RPC_NAME = "get_online_display_viewer_bundle";

export function resolveViewerRpcFailureStage(input) {
  if (input.viewerRpcAttempted !== true) {
    return "none";
  }
  if (input.viewerRpcSupabaseCode === "42501" || input.viewerRpcSupabaseCode === "PGRST301") {
    return "viewer_rpc_permission_denied";
  }
  if (input.viewerRpcSupabaseCode === "42883" || input.viewerRpcSupabaseCode === "PGRST202") {
    return "viewer_rpc_not_found";
  }
  if (input.viewerRpcSupabaseCode) {
    return "viewer_rpc_query_failed";
  }
  if (input.viewerRpcResponseValid !== true) {
    return "viewer_rpc_response_invalid";
  }
  const code = input.viewerRpcBundleCode;
  if (code === "not_published") {
    return "published_revision_missing";
  }
  if (code === "viewer_offline" || code === "publisher_offline") {
    if (input.viewerRpcPublisherOnline === false && input.viewerRpcLeaseExpiresAt == null) {
      return "publisher_lease_missing";
    }
    if (input.viewerRpcLeaseValid === false) {
      return input.viewerRpcLeaseExpired ? "publisher_lease_expired" : "publisher_not_online";
    }
    return "publisher_not_online";
  }
  if (code === "online_viewer_disabled") {
    return "viewer_rpc_response_invalid";
  }
  if (code === "viewer_ready") {
    return "none";
  }
  if (code === "not_found" || code === "authentication_required") {
    return "viewer_rpc_query_failed";
  }
  return code ? "viewer_rpc_query_failed" : "viewer_rpc_response_invalid";
}

export async function callViewerBundleRpc(client, projectSlug, displaySlug) {
  const viewerRpcAttempted = Boolean(client);
  if (!client) {
    return {
      viewerRpcAttempted: false,
      viewerRpcName: VIEWER_BUNDLE_RPC_NAME,
      viewerRpcSupabaseCode: null,
      viewerRpcSafeMessage: "Supabase client unavailable.",
      viewerRpcHttpStatus: null,
      viewerRpcReturnedRows: null,
      viewerRpcResponseValid: false,
      viewerRpcAuthorizationResult: null,
      viewerRpcOnlineViewerEnabled: null,
      viewerRpcPublishedRevisionId: null,
      viewerRpcPublisherInstanceId: null,
      viewerRpcLeaseExpiresAt: null,
      viewerRpcPublisherOnline: null,
      viewerRpcLeaseValid: null,
      viewerRpcLeaseExpired: null,
      viewerRpcBundleCode: null,
      viewerRpcBundleOk: null,
      bundle: null,
      firstViewerRpcFailureStage: "none",
    };
  }

  const { data, error, status } = await client.rpc(VIEWER_BUNDLE_RPC_NAME, {
    p_project_slug: projectSlug,
    p_display_slug: displaySlug,
  });

  const bundle = data && typeof data === "object" ? data : null;
  const viewerRpcResponseValid =
    !error && bundle != null && typeof bundle.ok === "boolean";

  const viewerRpcBundleCode =
    bundle && typeof bundle.code === "string"
      ? bundle.code
      : viewerRpcResponseValid && bundle.ok
        ? "viewer_ready"
        : error
          ? "rpc_error"
          : "unknown";

  const leaseExpiresAt =
    bundle && typeof bundle.lease_expires_at === "string" ? bundle.lease_expires_at : null;
  const leaseExpired =
    leaseExpiresAt != null ? Date.parse(leaseExpiresAt) <= Date.now() : null;
  const leaseValid =
    leaseExpiresAt != null ? Date.parse(leaseExpiresAt) > Date.now() : false;

  const diagnostic = {
    viewerRpcAttempted,
    viewerRpcName: VIEWER_BUNDLE_RPC_NAME,
    viewerRpcSupabaseCode: error?.code ?? null,
    viewerRpcSafeMessage: error ? sanitizeError(error).message : null,
    viewerRpcHttpStatus: typeof status === "number" ? status : null,
    viewerRpcReturnedRows: bundle ? 1 : 0,
    viewerRpcResponseValid,
    viewerRpcAuthorizationResult:
      bundle?.code === "authentication_required"
        ? "authentication_required"
        : bundle?.code === "not_found"
          ? "not_found"
          : viewerRpcResponseValid && bundle.ok
            ? "authorized"
            : null,
    viewerRpcOnlineViewerEnabled:
      typeof bundle?.online_viewer_enabled === "boolean"
        ? bundle.online_viewer_enabled
        : null,
    viewerRpcPublishedRevisionId:
      typeof bundle?.published_revision_id === "string"
        ? bundle.published_revision_id
        : null,
    viewerRpcPublisherInstanceId:
      typeof bundle?.publisher_instance_id === "string"
        ? bundle.publisher_instance_id
        : null,
    viewerRpcLeaseExpiresAt: leaseExpiresAt,
    viewerRpcPublisherOnline:
      typeof bundle?.publisher_online === "boolean" ? bundle.publisher_online : null,
    viewerRpcLeaseValid: leaseExpiresAt != null ? leaseValid : null,
    viewerRpcLeaseExpired: leaseExpiresAt != null ? leaseExpired : null,
    viewerRpcBundleCode,
    viewerRpcBundleOk: typeof bundle?.ok === "boolean" ? bundle.ok : null,
    bundle,
  };

  diagnostic.firstViewerRpcFailureStage = resolveViewerRpcFailureStage({
    ...diagnostic,
    viewerRpcBundleCode,
  });

  return diagnostic;
}
