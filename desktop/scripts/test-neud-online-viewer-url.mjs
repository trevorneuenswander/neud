#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("viewer URL builder accepts configured hosted origin", () => {
  const viewerUrl = read("src/lib/hosted/viewer-url.ts");
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  assert.match(viewerUrl, /buildAbsoluteHostedViewerUrl/);
  assert.match(viewerUrl, /buildAbsoluteHostedFullscreenViewerUrl/);
  assert.match(viewerUrl, /buildHostedFullscreenViewerPath/);
  assert.match(viewerUrl, /hostedOrigin\?: string \| null/);
  assert.match(viewerUrl, /getTrustedPortalOrigin/);
  assert.match(viewerUrl, /resolveHostedViewerPath/);
  assert.match(viewerUrl, /logHostedViewerUrlDiagnostic/);
  assert.match(hostedRoutes, /getPrivateDisplayViewerPath/);
  assert.match(hostedRoutes, /isHostedViewerPath/);
  assert.match(hostedRoutes, /isHostedFullscreenViewerPath/);
});

test("desktop resolves hosted portal origin through local API", () => {
  const hook = read("src/lib/hosted/use-hosted-portal-origin.ts");
  const localApi = read("desktop/src/services/local-api-server.ts");
  const localData = read("desktop/src/services/local-data-service.ts");

  assert.match(hook, /\/api\/hosted\/portal-origin/);
  assert.match(localApi, /\/api\/hosted\/portal-origin/);
  assert.match(localData, /getHostedPortalOrigin/);
  assert.match(localData, /resolveTrustedPortalOrigin/);
});

test("view online and edit page share the same fullscreen URL builder", () => {
  const button = read("src/components/displays/ViewOnlineButton.tsx");
  const panel = read("src/components/displays/OnlineViewerPanel.tsx");
  assert.match(button, /buildAbsoluteHostedFullscreenViewerUrl/);
  assert.match(button, /useHostedPortalOrigin/);
  assert.match(panel, /buildAbsoluteHostedFullscreenViewerUrl/);
  assert.match(panel, /useHostedPortalOrigin/);
});

test("external links require https or localhost", () => {
  const external = read("desktop/src/services/external-url.ts");
  assert.match(external, /https:\/\//);
  assert.match(external, /http:\/\/localhost/);
});

test("hosted viewer distinguishes safe load error states", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const bundle = read("src/lib/hosted/viewer-bundle.ts");
  assert.match(client, /parseViewerBundleRpcResult/);
  assert.match(bundle, /authentication_required/);
  assert.match(bundle, /resolveViewerLoadErrorMessage/);
  assert.match(bundle, /invalid_bundle/);
  assert.match(bundle, /temporary_cloud_error/);
});
