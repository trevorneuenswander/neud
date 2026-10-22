export type YouTubeCallbackPage =
  | { kind: "connected" }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Local loopback page. Success is rendered only after NEUD has saved the token.
 * window.close() is attempted for tabs the browser allows to close; the copy
 * does not depend on that succeeding.
 */
export function renderYouTubeCallbackPage(page: YouTubeCallbackPage): string {
  const tone = page.kind === "connected" ? "#22C55E" : page.kind === "failed" ? "#EF4444" : "#F59E0B";
  const heading =
    page.kind === "connected"
      ? "YouTube Connected"
      : page.kind === "failed"
        ? "YouTube Connection Failed"
        : "Authorization Cancelled";
  const description =
    page.kind === "connected"
      ? "Your YouTube account has been successfully authorized."
      : page.kind === "failed"
        ? escapeHtml(page.message)
        : "Your YouTube account was not connected.";
  const secondary =
    page.kind === "connected"
      ? "You can return to NEUD."
      : page.kind === "cancelled"
        ? "You can return to NEUD and try again."
        : "You can return to NEUD and start the connection again.";
  const icon =
    page.kind === "connected"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 7 10 17l-6-6"/></svg>`
      : page.kind === "failed"
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 12h12"/></svg>`;
  const closeScript =
    page.kind === "connected"
      ? "<script>window.setTimeout(function(){window.close();},800);</script>"
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NEUD</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0B0F14;
      color: #F3F6FA;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.18), transparent 58%);
      pointer-events: none;
    }
    main {
      width: min(440px, calc(100% - 32px));
      position: relative;
      background: #151B23;
      border: 1px solid #27303C;
      border-radius: 16px;
      padding: 40px 32px 32px;
      text-align: center;
    }
    .brand {
      margin: 0 0 28px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.34em;
      text-transform: uppercase;
    }
    .icon {
      width: 56px;
      height: 56px;
      margin: 0 auto;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: ${tone};
      background: color-mix(in srgb, ${tone} 16%, transparent);
    }
    .icon svg { width: 28px; height: 28px; }
    h1 { margin: 18px 0 8px; font-size: 28px; font-weight: 560; letter-spacing: -0.02em; }
    p { margin: 8px 0; color: #8B98A8; line-height: 1.5; font-size: 16px; }
    .close { margin-top: 22px; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">NEUD</p>
    <div class="icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${description}</p>
    <p>${secondary}</p>
    <p class="close">You can safely close this window and return to NEUD.</p>
  </main>
  ${closeScript}
</body>
</html>`;
}
