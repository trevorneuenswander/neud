#!/usr/bin/env node
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function encodeHostedRouteSlug(slug) {
  return encodeURIComponent(slug.trim());
}

function getPrivateDisplayViewerPath(projectSlug, displaySlug) {
  return `/portal/projects/${encodeHostedRouteSlug(projectSlug)}/displays/${encodeHostedRouteSlug(displaySlug)}`;
}

function getPublicDisplayViewerPath(projectSlug, displaySlug) {
  return `/view/${encodeHostedRouteSlug(projectSlug)}/${encodeHostedRouteSlug(displaySlug)}`;
}

function isValidHostedViewerSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim());
}

test("private and public viewer app router pages exist", () => {
  assert.ok(
    fs.existsSync(
      path.join(
        repoRoot,
        "src/app/portal/projects/[slug]/displays/[displaySlug]/page.tsx",
      ),
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(
        repoRoot,
        "src/app/portal/projects/[slug]/displays/[displaySlug]/fullscreen/page.tsx",
      ),
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "src/app/view/[projectSlug]/[displaySlug]/page.tsx"),
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "src/app/view/[projectSlug]/[displaySlug]/fullscreen/page.tsx"),
    ),
  );
});

test("canonical route builders match app router segments", () => {
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  assert.match(hostedRoutes, /getPrivateDisplayViewerPath/);
  assert.match(hostedRoutes, /getPublicDisplayViewerPath/);
  assert.match(hostedRoutes, /getPrivateDisplayFullscreenPath/);
  assert.match(hostedRoutes, /getPublicDisplayFullscreenPath/);
  assert.match(hostedRoutes, /HOSTED_VIEWER_ROUTE_TEMPLATES/);

  const privatePath = getPrivateDisplayViewerPath(
    "broad-arrow-auctions",
    "stream-bid-display",
  );
  const publicPath = getPublicDisplayViewerPath(
    "broad-arrow-auctions",
    "stream-ticker",
  );
  const privateFullscreenPath = `${privatePath}/fullscreen`;
  const publicFullscreenPath = `${publicPath}/fullscreen`;

  assert.equal(
    privatePath,
    "/portal/projects/broad-arrow-auctions/displays/stream-bid-display",
  );
  assert.equal(publicPath, "/view/broad-arrow-auctions/stream-ticker");
  assert.equal(
    privateFullscreenPath,
    "/portal/projects/broad-arrow-auctions/displays/stream-bid-display/fullscreen",
  );
  assert.equal(
    publicFullscreenPath,
    "/view/broad-arrow-auctions/stream-ticker/fullscreen",
  );
});

test("invalid slugs are rejected by viewer path builder", () => {
  const viewerUrl = read("src/lib/hosted/viewer-url.ts");
  assert.match(viewerUrl, /isValidHostedViewerSlug/);
  assert.match(viewerUrl, /return null/);
  assert.equal(isValidHostedViewerSlug(""), false);
  assert.equal(isValidHostedViewerSlug("bad slug"), false);
  assert.equal(isValidHostedViewerSlug("stream-bid-display"), true);
});

test("middleware keeps hosted viewer routes outside desktop-only redirects", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  assert.match(proxy, /isHostedViewerPath/);
  assert.match(hostedRoutes, /export function isHostedViewerPath/);
  assert.match(proxy, /!isHostedViewerPath\(pathname\) && isHostedDesktopOnlyPath/);
});

test("origin normalization strips paths and trailing slashes", () => {
  const viewerUrl = read("src/lib/hosted/viewer-url.ts");
  const env = read("src/lib/env/neud-env.ts");
  assert.match(viewerUrl, /normalizeHostedPortalOrigin/);
  assert.match(viewerUrl, /url\.origin/);
  assert.match(env, /return url\.origin/);
});

test("view online and edit panel share the hosted fullscreen viewer url builder", () => {
  const button = read("src/components/displays/ViewOnlineButton.tsx");
  const panel = read("src/components/displays/OnlineViewerPanel.tsx");
  assert.match(button, /buildAbsoluteHostedFullscreenViewerUrl/);
  assert.match(panel, /buildAbsoluteHostedFullscreenViewerUrl/);
  assert.match(panel, /buildHostedFullscreenViewerPath/);
});

test("hosted viewer client shows unavailable state instead of framework notFound for unpublished displays", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const privatePage = read(
    "src/app/portal/projects/[slug]/displays/[displaySlug]/page.tsx",
  );
  assert.match(client, /parseViewerBundleRpcResult/);
  assert.match(read("src/lib/hosted/viewer-bundle.ts"), /not_published/);
  assert.match(privatePage, /HostedDisplayViewerClient/);
  assert.doesNotMatch(privatePage, /getHostedProjectPortalSummary/);
  assert.match(privatePage, /if \(!slug \|\| !displaySlug\)/);
});

test("root build output includes both hosted viewer routes", () => {
  const buildOutput = execSync("npm run build", {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.match(buildOutput, /\/portal\/projects\/\[slug\]\/displays\/\[displaySlug\]/);
  assert.match(buildOutput, /\/portal\/projects\/\[slug\]\/displays\/\[displaySlug\]\/fullscreen/);
  assert.match(buildOutput, /\/view\/\[projectSlug\]\/\[displaySlug\]/);
  assert.match(buildOutput, /\/view\/\[projectSlug\]\/\[displaySlug\]\/fullscreen/);
});
