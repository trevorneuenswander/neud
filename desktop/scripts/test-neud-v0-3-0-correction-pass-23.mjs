#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 23 —
 * Stream Bid composite/z-order + Zoom Live Chat config + Overview Capabilities.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

test("STREAM BID: isolated title slab renderer preserved (Pass 22 contract)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /TITLE_SLAB_HEIGHT\s*=\s*480/);
  assert.match(html, /TITLE_SLAB_BASELINE_Y\s*=\s*200/);
  assert.match(html, /verticalCrop:\s*false/);
  assert.match(html, /__streamBidExportTitleBitmap/);
  assert.match(html, /__streamBidExportStageAfterTitle/);
});

test("STREAM BID: named z-order contract + title above opaque panels", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /--z-stage-bg:\s*1/);
  assert.match(html, /--z-photos:\s*2/);
  assert.match(html, /--z-bid:\s*2/);
  assert.match(html, /--z-title:\s*10/);
  assert.match(html, /z-index:\s*var\(--z-title\)/);
  assert.match(html, /data-z-contract=["']pass23["']/);
  assert.match(html, /data-z-layer=["']title["']/);
  // Title canvas must appear after white-field / photos in DOM.
  const whiteIdx = html.indexOf('class="white-field-composite"');
  const titleIdx = html.indexOf('id="lotTitleCanvas"');
  assert.ok(whiteIdx >= 0 && titleIdx > whiteIdx);
});

test("STREAM BID: compositeDiag magenta/cyan + force-top hooks", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /compositeDiag/);
  assert.match(html, /TITLE_COMPOSITE_DIAG/);
  assert.match(html, /#FF00FF/);
  assert.match(html, /composite-diag-cyan-band/);
  assert.match(html, /titleForceTop|is-force-top/);
  assert.match(html, /collectStreamBidLayerRects/);
  assert.match(html, /__streamBidCompositeCaptures/);
});

test("OVERVIEW: Capabilities label — no hardcoded Project Type Webpage Scraper", () => {
  const overview = read("src/components/projects/ProjectOverview.tsx");
  assert.match(overview, /Capabilities/);
  assert.match(overview, /ProjectCapabilityTags/);
  assert.doesNotMatch(overview, /Project type[\s\S]{0,80}Webpage Scraper/);
  assert.doesNotMatch(overview, /<dd[^>]*>Webpage Scraper<\/dd>/);
  const page = read("src/app/(portal)/projects/[slug]/page.tsx");
  assert.match(page, /resolveOverviewCapabilities|localGetProjectCapabilities/);
  assert.match(page, /capabilities=\{capabilities\}/);
});

test("OVERVIEW: multi-capability catalog used for Scopely-style projects", () => {
  const caps = read("src/lib/projects/capabilities.ts");
  assert.match(caps, /id:\s*"live-chat"/);
  assert.match(caps, /label:\s*"Live Chat"/);
  assert.match(caps, /case "live-chat":/);
});

test("ZOOM: secure machine credential store (no secrets in packages)", () => {
  assert.ok(exists("desktop/src/integrations/zoom/zoom-credential-store.ts"));
  assert.ok(exists("desktop/src/integrations/zoom/zoom-integration-service.ts"));
  assert.ok(exists("desktop/src/integrations/zoom/zoom-types.ts"));
  const store = read("desktop/src/integrations/zoom/zoom-credential-store.ts");
  assert.match(store, /safeStorage/);
  assert.match(store, /credentialsDir/);
  assert.doesNotMatch(store, /localStorage\.(setItem|getItem)/);
  const builder = read("desktop/src/packages/modular-package-builder.ts");
  assert.doesNotMatch(builder, /clientSecret|CLIENT_SECRET|access_token/);
  const service = read("desktop/src/live-chat/live-chat-service.ts");
  assert.match(service, /delete safeSettings/);
});

test("ZOOM: provider uses integration + friendly AUTH_NOT_CONFIGURED", () => {
  const zoom = read("desktop/src/live-chat/providers/zoom-provider.ts");
  assert.match(zoom, /ZoomIntegrationService|setIntegration/);
  assert.match(zoom, /AUTH_NOT_CONFIGURED/);
  assert.match(zoom, /friendlyZoomMessage/);
  assert.match(zoom, /startRtmsForLiveMeeting|lookupMeetingOrWebinar/);
  assert.doesNotMatch(zoom, /puppeteer|document\.querySelector|page\.evaluate/i);
  assert.match(zoom, /getDiagnostics/);
  assert.match(zoom, /clientSecret:\s*undefined/);
});

test("ZOOM: Live Chat page hosts Zoom connection UX (Pass 24 relocated from Settings)", () => {
  const settings = read("src/app/(portal)/settings/page.tsx");
  assert.doesNotMatch(settings, /ZoomIntegrationsSection/);
  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /Zoom is not connected/);
  assert.match(client, /Connect Zoom/);
  assert.match(client, /Zoom Connection/);
  assert.match(client, /Source Type/);
  assert.match(client, /Meeting ID|Webinar ID/);
  assert.match(client, /Save Zoom OAuth Settings|Save Public Client ID|Save App Credentials|Connect Zoom/);
});

test("ZOOM: local API routes redact secrets", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /\/api\/integrations\/zoom/);
  assert.match(api, /getPublicStatus/);
  assert.match(api, /saveAppCredentials/);
  assert.match(api, /validateCredentials/);
  const types = read("desktop/src/integrations/zoom/zoom-types.ts");
  assert.match(types, /maskSecret/);
  assert.match(types, /zoom-rtms-general-oauth-pkce|zoom-rtms-general-oauth/);
});

test("LIVE CHAT: Manual provider remains independent", () => {
  const manual = read("desktop/src/live-chat/providers/manual-provider.ts");
  assert.match(manual, /class ManualLiveChatProvider/);
  const registry = read("desktop/src/live-chat/providers/registry.ts");
  assert.match(registry, /manual:\s*\(\)\s*=>\s*new ManualLiveChatProvider/);
  assert.match(registry, /zoom:\s*\(\)\s*=>\s*new ZoomLiveChatProvider/);
});
