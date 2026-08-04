import { readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { injectDisplayFetchGuard } from "@/lib/displays/display-viewer-html";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

const DISPLAY_KEY = "new-bid-display-v1";

async function isDisplayEnabled(): Promise<boolean> {
  if (!shouldUseLocalData()) {
    return false;
  }

  try {
    const response = await fetch(
      `${getLocalApiBaseUrl()}/api/displays/${DISPLAY_KEY}/enabled`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => ({}))) as { enabled?: boolean };
    if (response.ok) {
      return payload.enabled === true;
    }
  } catch {
    // Default to disabled for new displays.
  }

  return false;
}

function renderDisabledPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Display Off</title>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      width: 3840px;
      height: 2160px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #fff;
      background: rgba(5, 8, 13, 0.85);
    }
    .message {
      font-size: 42px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div class="message">Display Off</div>
</body>
</html>`;
}

function loadDisplayHtml(): string {
  return readFileSync(
    path.join(process.cwd(), "public", "displays", DISPLAY_KEY, "index.html"),
    "utf8",
  );
}

export async function GET(request: Request) {
  const enabled = await isDisplayEnabled();
  if (!enabled) {
    return new NextResponse(renderDisabledPage(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const url = new URL(request.url);
  const html = loadDisplayHtml();
  const poll = url.searchParams.get("poll");
  const src = url.searchParams.get("src");

  let output = html;
  if (src) {
    output = output.replace(
      'endpoint: "/api/displays/new-bid-display-v1/data"',
      `endpoint: ${JSON.stringify(src)}`,
    );
  }
  if (poll) {
    output = output.replace(
      'pollMs: 1000',
      `pollMs: ${JSON.stringify(Number(poll) || 1000)}`,
    );
  }

  return new NextResponse(injectDisplayFetchGuard(output), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
