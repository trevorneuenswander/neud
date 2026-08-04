import { NextResponse } from "next/server";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

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
  if (clientSource) {
    headers["X-NEUD-Display-Client"] = clientSource;
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
      const response = await fetch(
        buildLocalDisplayActionPath(projectId, slug, "data", query),
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
