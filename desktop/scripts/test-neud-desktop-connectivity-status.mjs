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

function resolveInternetConnectivityPresentation(input) {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const browserLabel = input.browserOnline ? "connected" : "disconnected";
  const probeLabel = input.reachabilityProbeSucceeded ? "succeeded" : "failed";
  const detail = `Network interface: ${browserLabel}. External probe: ${probeLabel}. Last checked ${new Date(checkedAt).toLocaleTimeString()}.`;

  if (!input.browserOnline || !input.reachabilityProbeSucceeded) {
    return { label: "Offline", tone: "destructive", detail };
  }
  return { label: "Online", tone: "success", detail };
}

test("navigator.onLine === false → Offline without external probe", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  assert.match(internet, /if \(!browserOnline\)/);
  assert.match(internet, /reachabilityProbeSucceeded: false/);

  const result = resolveInternetConnectivityPresentation({
    browserOnline: false,
    reachabilityProbeSucceeded: false,
  });
  assert.equal(result.label, "Offline");
});

test("primary endpoint succeeds → Online", () => {
  const result = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: true,
  });
  assert.equal(result.label, "Online");
});

test("primary fails and secondary succeeds → Online", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  assert.match(internet, /probeAnyExternalInternetEndpoint/);
  assert.match(internet, /for \(const url of INTERNET_REACHABILITY_PROBE_URLS\)/);

  const result = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: true,
  });
  assert.equal(result.label, "Online");
});

test("both external endpoints fail → Offline", () => {
  const result = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: false,
  });
  assert.equal(result.label, "Offline");
});

test("local API healthy while external internet is unavailable → Offline", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  assert.doesNotMatch(internet, /\/api\/health/);
  assert.doesNotMatch(internet, /LOCAL_HEALTH/);

  const result = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: false,
  });
  assert.equal(result.label, "Offline");
});

test("external probe timeout → bounded failure", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  assert.match(internet, /INTERNET_PROBE_TIMEOUT_MS = 4_000/);
  assert.match(internet, /controller\.abort\(\)/);
});

test("recovery from Offline to Online", () => {
  const offline = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: false,
  });
  const online = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: true,
  });
  assert.equal(offline.label, "Offline");
  assert.equal(online.label, "Online");
});

test("loss from Online to Offline", () => {
  const online = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: true,
  });
  const offline = resolveInternetConnectivityPresentation({
    browserOnline: false,
    reachabilityProbeSucceeded: false,
  });
  assert.equal(online.label, "Online");
  assert.equal(offline.label, "Offline");
});

test("internet available and signed out → Online", () => {
  const result = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: true,
  });
  assert.equal(result.label, "Online");
});

test("internet available with Supabase unavailable → Online", () => {
  const result = resolveInternetConnectivityPresentation({
    browserOnline: true,
    reachabilityProbeSucceeded: true,
  });
  assert.equal(result.label, "Online");
});

test("no authentication calls are made during connectivity probing", () => {
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  const internet = read("src/lib/connectivity/internet-connection.ts");
  assert.doesNotMatch(hook, /verify-online/);
  assert.doesNotMatch(internet, /verify-online/);
  assert.doesNotMatch(internet, /refreshOnlineVerification/);
  assert.match(hook, /probeInternetConnectivityPresentation/);
});

test("no /api/health fallback is used as internet evidence", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  const connectivity = read("src/lib/connectivity/internet-connectivity.ts");
  assert.doesNotMatch(internet, /\/api\/health/);
  assert.match(internet, /msftconnecttest|INTERNET_REACHABILITY_PROBE_URL/);
  assert.match(connectivity, /connectivitycheck\.gstatic\.com/);
  assert.match(connectivity, /External probe:/);
});

test("footer presentation is binary Online or Offline only", () => {
  const internet = read("src/lib/connectivity/internet-connectivity.ts");
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  assert.doesNotMatch(internet, /Reconnecting/);
  assert.doesNotMatch(internet, /Signed Out/);
  assert.doesNotMatch(internet, /Cloud Unavailable/);
  assert.doesNotMatch(internet, /Offline Access/);
  assert.doesNotMatch(hook, /Checking…/);
});

test("sidebar footer uses internet connectivity presentation", () => {
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  assert.match(sidebar, /useConnectivityPresentation/);
  assert.match(sidebar, /shouldRunDesktopConnectivityProbe/);
  assert.match(sidebar, /connectivity\.label/);
  assert.match(sidebar, /connectivity\.detail/);
});

test("internal auth bundle remains separate from footer internet indicator", () => {
  const status = read("src/lib/connectivity/connectivity-status.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(status, /DesktopAuthStatusBundle/);
  assert.doesNotMatch(status, /resolveConnectivityPresentation/);
  assert.match(localData, /getAuthStatusBundle/);
});
