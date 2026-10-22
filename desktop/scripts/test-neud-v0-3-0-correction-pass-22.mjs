#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 22 —
 * Stream Bid zero vertical crop + project UX + create/install + Live Chat.
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

test("STREAM BID: production title bitmap is NOT vertically cropped to alpha bounds", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /TITLE_SLAB_HEIGHT\s*=\s*480/);
  assert.match(html, /TITLE_SLAB_BASELINE_Y\s*=\s*200/);
  assert.match(html, /textBaseline\s*=\s*["']alphabetic["']/);
  assert.match(html, /verticalCrop:\s*false/);
  assert.match(html, /data-title-layout=["']pass22["']/);
  assert.doesNotMatch(html, /inkTop[\s\S]{0,80}normalizedH|cropToInk|cropY\s*=/);
  assert.match(html, /productionBaselineY\s*-\s*TITLE_SLAB_BASELINE_Y|slabBaseline/);
});

test("STREAM BID: alpha diagnostic threshold > 0 only (not production crop)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /scanInkBounds|inkBottom/);
  assert.match(html, /a\s*>\s*0/);
});

test("NAV: CAPABILITY_NAV_ORDER puts Webpage Scraper / Data Source before Local Controller", () => {
  const web = read("src/lib/projects/capabilities.ts");
  assert.match(web, /CAPABILITY_NAV_ORDER/);
  assert.match(web, /sortCapabilitiesForNav/);
  const orderMatch = web.match(
    /CAPABILITY_NAV_ORDER[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const/,
  );
  assert.ok(orderMatch, "CAPABILITY_NAV_ORDER array present");
  const order = orderMatch[1];
  const scraper = order.indexOf('"webpage-scraper"');
  const dataSource = order.indexOf('"data-source"');
  const controller = order.indexOf('"manual-controller"');
  assert.ok(dataSource >= 0 && scraper >= 0 && controller >= 0);
  assert.ok(dataSource < controller, "data-source before manual-controller");
  assert.ok(scraper < controller, "webpage-scraper before manual-controller");
  const liveChat = order.indexOf('"live-chat"');
  assert.ok(liveChat > scraper && liveChat < controller);
});

test("UX: New Project primary blue + wizard polish + team cards", () => {
  const actions = read("src/components/projects/ProjectsPageActions.tsx");
  const wizard = read("src/components/projects/NewProjectWizard.tsx");
  assert.match(actions, /variant=["']primary["']/);
  assert.match(actions, /size=["']sm["']/);
  assert.match(wizard, /variant=["']primary["'][\s\S]*Continue|Continue[\s\S]*variant=["']primary["']/);
  assert.match(wizard, /Create Project/);
  assert.doesNotMatch(wizard, /Internal id|Internal ID|Project ID|UUID/i);
  assert.doesNotMatch(wizard, /type=["']checkbox["']/);
  assert.match(wizard, /toggleTeam/);
  assert.match(wizard, /border-primary bg-primary\/10/);
});

test("SETTINGS: Save Capabilities primary + left-aligned + IPC path", () => {
  const editor = read("src/components/projects/ProjectCapabilitiesEditor.tsx");
  const mutations = read("src/lib/local/project-mutations-api.ts");
  const ipc = read("desktop/src/ipc/local-data.ts");
  const preload = read("desktop/src/preload.ts");
  assert.match(editor, /justify-start/);
  assert.match(editor, /variant=["']primary["']/);
  assert.match(editor, /project-mutations-api/);
  assert.match(mutations, /updateProjectCapabilities/);
  assert.match(mutations, /desktop\?\.local\?\.updateProjectCapabilities/);
  assert.match(ipc, /neud:local:updateProjectCapabilities/);
  assert.match(preload, /updateProjectCapabilities/);
});

test("CREATE: creator auto-install + cloud publish orchestration", () => {
  const data = read("desktop/src/services/local-data-service.ts");
  const pkg = read("desktop/src/packages/project-package-service.ts");
  const cloud = read("desktop/src/packages/cloud-package-publisher.ts");
  const migration = read("supabase/migrations/063_project_package_versions.sql");
  assert.match(data, /downloadPackage/);
  assert.match(data, /publishModularPackageVersion/);
  assert.match(data, /publishNewProjectToCloud/);
  assert.match(data, /register_hosted_project_for_desktop/);
  assert.match(pkg, /publishModularPackageVersion/);
  assert.match(cloud, /publish_project_package_version/);
  assert.match(migration, /project_package_versions/);
  assert.match(migration, /publish_project_package_version/);
});

test("LIVE CHAT: provider registry + canonical model + Manual provider", () => {
  assert.ok(exists("desktop/src/live-chat/types.ts"));
  assert.ok(exists("desktop/src/live-chat/live-chat-service.ts"));
  assert.ok(exists("desktop/src/live-chat/providers/registry.ts"));
  assert.ok(exists("desktop/src/live-chat/providers/manual-provider.ts"));
  assert.ok(exists("desktop/src/live-chat/providers/zoom-provider.ts"));
  assert.ok(exists("desktop/src/live-chat/providers/youtube-provider.ts"));
  assert.ok(exists("desktop/src/live-chat/providers/facebook-provider.ts"));
  const service = read("desktop/src/live-chat/live-chat-service.ts");
  assert.match(service, /incoming/);
  assert.match(service, /approved/);
  assert.match(service, /current/);
  assert.match(service, /automatic|producer/);
  assert.match(service, /hideCurrent/);
  assert.match(service, /takeMessage/);
  assert.match(service, /skipMessage/);
  const zoom = read("desktop/src/live-chat/providers/zoom-provider.ts");
  assert.match(zoom, /authentication_required/);
  assert.doesNotMatch(zoom, /scrape|puppeteer|DOM/i);
});

test("LIVE CHAT: overlay + module page + package inclusion", () => {
  assert.ok(exists("desktop/src/displays/bundled/live-chat-overlay-v1.html"));
  const overlay = read("desktop/src/displays/bundled/live-chat-overlay-v1.html");
  assert.match(overlay, /3840/);
  assert.match(overlay, /2160/);
  assert.match(overlay, /transparent/);
  assert.match(overlay, /neud-display-runtime|neudOnDisplayDataChanged|startDisplayBridgeEvents/);
  const modular = read("desktop/src/packages/modular-package-builder.ts");
  assert.match(modular, /live-chat/);
  assert.match(modular, /live-chat-overlay/);
  const page = read("src/app/(portal)/projects/[slug]/live-chat/page.tsx");
  assert.match(page, /LiveChatClient/);
  assert.doesNotMatch(page, /CapabilityModulePlaceholder/);
  const caps = read("src/lib/projects/capabilities.ts");
  assert.match(caps, /id:\s*"live-chat"[\s\S]*implemented:\s*true/);
});

test("LIVE CHAT: no secrets in package/config persistence", () => {
  const service = read("desktop/src/live-chat/live-chat-service.ts");
  assert.match(service, /token|secret|password|key/i);
  assert.match(service, /delete safeSettings/);
  const builder = read("desktop/src/packages/modular-package-builder.ts");
  assert.doesNotMatch(builder, /CLIENT_SECRET|access_token|NEUD_ZOOM/);
});
