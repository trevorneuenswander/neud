import { NextResponse } from "next/server";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";
import {
  appendDisplayDataProxyPipelineLog,
  readDisplayDataProxyTraceHeaders,
} from "@/lib/displays/display-data-proxy-pipeline";

type ProjectDisplayRouteContext = {
  params: Promise<{ projectId: string; slug: string }>;
};

function buildLocalDisplayViewerPath(projectId: string, slug: string, query: string) {
  const base = `${getLocalApiBaseUrl()}/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}`;
  return query ? `${base}${query.startsWith("?") ? query : `?${query}`}` : base;
}

function buildLocalDisplayActionPath(
  projectId: string,
  slug: string,
  action: "data" | "enabled" | "meta",
  query: string,
) {
  const base = `${buildLocalDisplayViewerPath(projectId, slug, "")}/${action}`;
  return query ? `${base}${query.startsWith("?") ? query : `?${query}`}` : base;
}

function forwardDisplayClientHeaders(request: Request): HeadersInit {
  const headers: Record<string, string> = {};
  const clientSource = request.headers.get("x-neud-display-client");
  const referer = request.headers.get("referer");
  const traceEventId = request.headers.get("x-neud-trace-event-id");
  const displayClientId = request.headers.get("x-neud-display-client-id");
  const fetchRequestId = request.headers.get("x-neud-display-fetch-request-id");
  if (clientSource) {
    headers["X-NEUD-Display-Client"] = clientSource;
  }
  if (traceEventId) {
    headers["X-NEUD-Trace-Event-Id"] = traceEventId;
  }
  if (displayClientId) {
    headers["X-NEUD-Display-Client-Id"] = displayClientId;
  }
  if (fetchRequestId) {
    headers["X-NEUD-Display-Fetch-Request-Id"] = fetchRequestId;
  }
  if (referer) {
    headers.Referer = referer;
  }
  return headers;
}

export async function proxyProjectDisplayDataRoute(
  request: Request,
  context: ProjectDisplayRouteContext,
) {
  const { projectId, slug } = await context.params;
  const query = new URL(request.url).search;

  if (shouldUseLocalData()) {
    try {
      const trace = readDisplayDataProxyTraceHeaders(request);
      const receivedAt = Date.now();
      appendDisplayDataProxyPipelineLog({
        stage: "next_proxy_request_received",
        atMs: receivedAt,
        ...trace,
        detail: { projectId, slug },
      });
      const localFetchStart = Date.now();
      appendDisplayDataProxyPipelineLog({
        stage: "next_proxy_fetch_started",
        atMs: localFetchStart,
        ...trace,
        detail: { localUrl: buildLocalDisplayActionPath(projectId, slug, "data", query) },
      });
      const response = await fetch(
        buildLocalDisplayActionPath(projectId, slug, "data", query),
        {
          cache: "no-store",
          headers: forwardDisplayClientHeaders(request),
        },
      );
      const localFetchFinished = Date.now();
      appendDisplayDataProxyPipelineLog({
        stage: "next_proxy_fetch_finished",
        atMs: localFetchFinished,
        ...trace,
        detail: {
          localFetchMs: localFetchFinished - localFetchStart,
          status: response.status,
        },
      });
      const payload = await response.json().catch(() => null);
      if (payload !== null) {
        const responseStart = Date.now();
        appendDisplayDataProxyPipelineLog({
          stage: "next_proxy_response_started",
          atMs: responseStart,
          ...trace,
          revision:
            typeof payload === "object" &&
            payload !== null &&
            typeof (payload as { revision?: unknown }).revision === "number"
              ? ((payload as { revision: number }).revision as number)
              : undefined,
          detail: {
            responseBytes: JSON.stringify(payload).length,
          },
        });
        const nextResponse = NextResponse.json(payload, {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        });
        appendDisplayDataProxyPipelineLog({
          stage: "next_proxy_response_finished",
          atMs: Date.now(),
          ...trace,
          detail: { totalProxyMs: Date.now() - receivedAt },
        });
        return nextResponse;
      }
    } catch {
      // Fall through to safe defaults below.
    }
  }

  return NextResponse.json(
    {
      dataConnected: false,
      enabled: false,
      status: "display_disabled",
      snapshot: null,
    },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function proxyProjectDisplayEnabledRoute(
  request: Request,
  context: ProjectDisplayRouteContext,
) {
  const { projectId, slug } = await context.params;
  const query = new URL(request.url).search;

  if (shouldUseLocalData()) {
    try {
      const response = await fetch(
        buildLocalDisplayActionPath(projectId, slug, "enabled", query),
        {
          cache: "no-store",
          headers: forwardDisplayClientHeaders(request),
        },
      );
      const payload = await response.json().catch(() => null);
      if (payload !== null) {
        return NextResponse.json(payload, {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        });
      }
    } catch {
      // Fall through to safe defaults below.
    }
  }

  return NextResponse.json(
    { enabled: false },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function proxyProjectDisplayMetaRoute(
  request: Request,
  context: ProjectDisplayRouteContext,
) {
  const { projectId, slug } = await context.params;

  if (shouldUseLocalData()) {
    try {
      const response = await fetch(
        buildLocalDisplayActionPath(projectId, slug, "meta", ""),
        {
          cache: "no-store",
          headers: forwardDisplayClientHeaders(request),
        },
      );
      const payload = await response.json().catch(() => null);
      if (payload !== null) {
        return NextResponse.json(payload, {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        });
      }
    } catch {
      // Fall through to safe defaults below.
    }
  }

  return NextResponse.json(
    { error: "Display not found." },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function proxyProjectDisplayViewerRoute(
  request: Request,
  context: ProjectDisplayRouteContext,
) {
  const { projectId, slug } = await context.params;
  const query = new URL(request.url).search;

  if (!shouldUseLocalData()) {
    return new NextResponse("Display viewer is only available in desktop mode.", {
      status: 404,
    });
  }

  try {
    const response = await fetch(buildLocalDisplayViewerPath(projectId, slug, query), {
      cache: "no-store",
    });
    const html = await response.text();
    return new NextResponse(html, {
      status: response.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    return new NextResponse("Unable to load display.", { status: 502 });
  }
}
