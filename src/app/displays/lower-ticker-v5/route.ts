import { readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { injectDisplayFetchGuard } from "@/lib/displays/display-viewer-html";
import { shouldUseLocalData, getLocalApiBaseUrl } from "@/lib/local/mode";

async function isLowerTickerEnabled(): Promise<boolean> {
  if (!shouldUseLocalData()) {
    return true;
  }

  try {
    const response = await fetch(
      `${getLocalApiBaseUrl()}/api/displays/lower-ticker-v5/enabled`,
      {
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as { enabled?: boolean };
    if (response.ok) {
      return payload.enabled === true;
    }
  } catch {
    // Default to enabled when local API is unavailable.
  }

  return true;
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
      width: 1920px;
      height: 1080px;
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

function loadLowerTickerHtml(): string {
  const htmlPath = path.join(
    process.cwd(),
    "public",
    "displays",
    "lower-ticker-v5",
    "index.html",
  );
  return readFileSync(htmlPath, "utf8");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const previewMode = url.searchParams.get("preview") === "1";
  const enabled = await isLowerTickerEnabled();
  if (!enabled && !previewMode) {
    return new NextResponse(renderDisabledPage(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = loadLowerTickerHtml();
  const poll = url.searchParams.get("poll");
  const src = url.searchParams.get("src");

  let output = html;
  if (src) {
    output = output.replace(
      "const DEFAULT_ENDPOINT = '/api/displays/lower-ticker-v5/data';",
      `const DEFAULT_ENDPOINT = ${JSON.stringify(src)};`,
    );
  } else if (previewMode) {
    output = output.replace(
      "const DEFAULT_ENDPOINT = '/api/displays/lower-ticker-v5/data';",
      "const DEFAULT_ENDPOINT = '/api/displays/lower-ticker-v5/data?preview=1';",
    );
  }
  if (poll) {
    output = output.replace(
      "const DEFAULT_POLL = 1000;",
      `const DEFAULT_POLL = ${JSON.stringify(poll)};`,
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
