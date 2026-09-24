#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const effectiveViewerStatusPath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/effective-viewer-status.ts"),
).href;

const {
  anonProbeMatchesExpectation,
  expectedAnonViewerProbeCode,
  resolveEffectiveViewerStatus,
} = await import(effectiveViewerStatusPath);

test("private display anon probe expects authentication_required", () => {
  assert.equal(expectedAnonViewerProbeCode("private"), "authentication_required");
  assert.equal(anonProbeMatchesExpectation("private", "authentication_required"), true);
  assert.equal(anonProbeMatchesExpectation("private", "viewer_ready"), false);
});

test("private display connected when anon expected and authenticated probe succeeds", () => {
  const status = resolveEffectiveViewerStatus({
    visibility: "private",
    onlineViewerEnabled: true,
    publishedRevisionPresent: true,
    publisherLeaseValid: true,
    heartbeatVerifiedInCloud: true,
    anonProbe: { code: "authentication_required", attempted: true },
    authenticatedProbe: {
      attempted: true,
      code: "viewer_ready",
      authorized: true,
      publisherOnline: true,
      viewerReady: true,
    },
  });
  assert.equal(status, "connected");
});

test("private display access denied for unauthorized authenticated user", () => {
  const status = resolveEffectiveViewerStatus({
    visibility: "private",
    onlineViewerEnabled: true,
    publishedRevisionPresent: true,
    publisherLeaseValid: true,
    anonProbe: { code: "authentication_required", attempted: true },
    authenticatedProbe: {
      attempted: true,
      code: "not_found",
      authorized: false,
      viewerReady: false,
    },
  });
  assert.equal(status, "access_denied");
});

test("public display connected on anon viewer_ready with publisher online", () => {
  const status = resolveEffectiveViewerStatus({
    visibility: "public",
    onlineViewerEnabled: true,
    publishedRevisionPresent: true,
    anonProbe: {
      code: "viewer_ready",
      attempted: true,
      publisherOnline: true,
      viewerReady: true,
    },
    authenticatedProbe: { attempted: false, code: null },
  });
  assert.equal(status, "connected");
});

test("portal bundle poll waits for private session before RPC", () => {
  const hook = read("src/lib/hosted/use-hosted-display-bundle-status.ts");
  assert.match(hook, /getSession/);
  assert.match(hook, /mode === "private" && !session\?\.access_token/);
  assert.match(hook, /onAuthStateChange/);
});

test("hosted display card marks portal session present for private status", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /portalSessionPresent: true/);
});

test("private portal preview route requires authenticated user", () => {
  const page = read("src/app/portal/projects/[slug]/displays/[displaySlug]/page.tsx");
  assert.match(page, /getUser/);
  assert.match(page, /redirect\(`\/login/);
  assert.match(page, /createClient/);
  assert.match(page, /get_online_display_viewer_bundle/);
});

test("private fullscreen route requires authenticated user", () => {
  const page = read(
    "src/app/portal/projects/[slug]/displays/[displaySlug]/fullscreen/page.tsx",
  );
  assert.match(page, /getUser/);
  assert.match(page, /redirect[\s\S]*\/login\?next=/);
});

test("diagnose broad-arrow online separates anon and authenticated viewer probes", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  assert.match(diagnose, /anonViewerProbe/);
  assert.match(diagnose, /authenticatedViewerProbe/);
  assert.match(diagnose, /effectiveViewerStatus/);
  assert.match(diagnose, /signInClient/);
});

test("connection status distinguishes private authentication_required from access_denied", () => {
  const status = read("src/lib/hosted/hosted-display-connection-status.ts");
  assert.match(status, /"authentication_required"/);
  assert.match(status, /portalSessionPresent/);
});
