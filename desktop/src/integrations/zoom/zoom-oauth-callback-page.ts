export type ZoomLoopbackPage =
  | { kind: "connected" }
  | { kind: "cancelled" }
  | { kind: "failed" };

/**
 * Development loopback page. Rendered only after the desktop app has
 * finished the Zoom token exchange, so a connected result is real.
 */
export function renderZoomLoopbackPage(page: ZoomLoopbackPage): string {
  const tone = page.kind === "connected" ? "#22C55E" : page.kind === "failed" ? "#EF4444" : "#F59E0B";
  const heading =
    page.kind === "connected"
      ? "Zoom Connected"
      : page.kind === "cancelled"
        ? "Zoom Authorization Cancelled"
        : "Unable to Complete Authorization";
  const description =
    page.kind === "connected"
      ? "Your Zoom account has been successfully authorized."
      : page.kind === "cancelled"
        ? "Your Zoom account was not connected."
        : "The Zoom authorization response was incomplete or invalid. Return to NEUD and try again.";
  const secondary =
    page.kind === "connected" ? "You can return to NEUD." : "You can return to NEUD and try again.";
  const icon =
    page.kind === "connected"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 7 10 17l-6-6"/></svg>`
      : page.kind === "failed"
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 12h12"/></svg>`;

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
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.34em;
      text-transform: uppercase;
    }
    .provider {
      display: inline-flex;
      margin: 16px 0 0;
      padding: 4px 12px;
      border: 1px solid #27303C;
      border-radius: 999px;
      color: #8B98A8;
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .icon {
      width: 56px;
      height: 56px;
      margin: 28px auto 0;
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
    <p class="provider">Zoom</p>
    <div class="icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${description}</p>
    <p>${secondary}</p>
    <p class="close">You can safely close this window and return to NEUD.</p>
  </main>
</body>
</html>`;
}
