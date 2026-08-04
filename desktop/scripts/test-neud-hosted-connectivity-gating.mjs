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

test("connectivity probe gate requires Electron desktop environment only", () => {
  const gate = read("src/lib/connectivity/should-run-desktop-connectivity-probe.ts");
  assert.match(gate, /isDesktopEnvironment/);
  assert.doesNotMatch(gate, /isDesktopRuntimeClient/);
  assert.doesNotMatch(gate, /shouldUseLocalDataClient/);
});

test("connectivity hook skips probe interval when desktop gate is false", () => {
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  assert.match(hook, /shouldRunDesktopConnectivityProbe/);
  assert.match(hook, /if \(!probeEnabled\)/);
  assert.match(hook, /HOSTED_IDLE_PRESENTATION/);
  assert.match(hook, /probeInternetConnectivityPresentation/);
});

test("connectivity probe function is gated before external fetch", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  assert.match(internet, /shouldRunDesktopConnectivityProbe/);
  assert.match(internet, /INTERNET_REACHABILITY_PROBE_URLS/);
});

test("sidebar hides internet indicator unless desktop probe gate is enabled", () => {
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  assert.match(sidebar, /shouldRunDesktopConnectivityProbe/);
  assert.match(sidebar, /showConnectivityIndicator/);
});

test("hosted viewer route does not mount sidebar connectivity panel", () => {
  const viewerPage = read("src/app/view/[projectSlug]/[displaySlug]/page.tsx");
  const viewerClient = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.doesNotMatch(viewerPage, /SidebarUserPanel/);
  assert.doesNotMatch(viewerClient, /useConnectivityPresentation/);
  assert.doesNotMatch(viewerClient, /msftconnecttest/);
  assert.doesNotMatch(viewerClient, /connectivitycheck\.gstatic/);
});

test("hosted portal shell uses gated sidebar connectivity hook", () => {
  const hostedShell = read("src/components/portal/HostedAppShell.tsx");
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  assert.match(hostedShell, /SidebarUserPanel/);
  assert.match(sidebar, /shouldRunDesktopConnectivityProbe/);
});
