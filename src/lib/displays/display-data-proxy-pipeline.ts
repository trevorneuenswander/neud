import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

export type DisplayDataProxyPipelineStage =
  | "next_proxy_request_received"
  | "next_proxy_fetch_started"
  | "next_proxy_fetch_finished"
  | "next_proxy_response_started"
  | "next_proxy_response_finished";

type PipelineLogInput = {
  stage: DisplayDataProxyPipelineStage;
  atMs: number;
  traceEventId?: string | null;
  displayClientId?: string | null;
  fetchRequestId?: string | null;
  revision?: number;
  detail?: Record<string, unknown>;
};

export function readDisplayDataProxyTraceHeaders(request: Request): {
  traceEventId: string | null;
  displayClientId: string | null;
  fetchRequestId: string | null;
} {
  return {
    traceEventId: request.headers.get("x-neud-trace-event-id")?.trim() || null,
    displayClientId: request.headers.get("x-neud-display-client-id")?.trim() || null,
    fetchRequestId: request.headers.get("x-neud-display-fetch-request-id")?.trim() || null,
  };
}

export function appendDisplayDataProxyPipelineLog(input: PipelineLogInput): void {
  if (!shouldUseLocalData()) {
    return;
  }
  void fetch(`${getLocalApiBaseUrl()}/api/internal/live-display-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  }).catch(() => {
    // Diagnostic-only.
  });
}
