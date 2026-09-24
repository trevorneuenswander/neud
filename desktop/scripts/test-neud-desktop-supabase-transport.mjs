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

test("WebSocket error source is @supabase/realtime-js websocket-factory", () => {
  const factoryPath = path.join(
    repoRoot,
    "node_modules",
    "@supabase",
    "realtime-js",
    "src",
    "lib",
    "websocket-factory.ts",
  );
  const source = fs.readFileSync(factoryPath, "utf8");
  assert.match(source, /Node\.js detected but native WebSocket not found/);
  assert.match(source, /transport option/);
});

test("desktop Supabase factory wires ws transport for RealtimeClient", () => {
  const factory = read("desktop/src/services/supabase-desktop-client.ts");
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(factory, /createDesktopSupabaseClient/);
  assert.match(factory, /from "ws"/);
  assert.match(factory, /transport:/);
  assert.match(session, /createDesktopSupabaseClient/);
  assert.doesNotMatch(session, /createClient\(/);
});

test("refresh client uses same factory as authenticated client", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  const refreshBlock = session.match(
    /const refreshClient = createDesktopSupabaseClient[\s\S]*?refreshSession/,
  )?.[0];
  assert.ok(refreshBlock);
  const ensureBlock = session.match(
    /this\.client = createDesktopSupabaseClient[\s\S]*?setSession/,
  )?.[0];
  assert.ok(ensureBlock);
});

test("node diagnostic helper uses ws transport", () => {
  const helper = read("scripts/live-validation/lib/supabase-node-client.mjs");
  assert.match(helper, /from "ws"/);
  assert.match(helper, /createNodeSupabaseClient/);
});

test("runtime diagnostics include transport readiness fields", () => {
  const shared = read("desktop/src/services/shared-cloud-auth-diagnostics.ts");
  const factory = read("desktop/src/services/supabase-desktop-client.ts");
  assert.match(shared, /authRefreshTransportReady/);
  assert.match(factory, /getDesktopSupabaseRuntimeDiagnostics/);
});

test("compiled desktop factory can construct client without throwing", async () => {
  const distPath = path.join(
    repoRoot,
    "desktop",
    "dist",
    "services",
    "supabase-desktop-client.js",
  );
  if (!fs.existsSync(distPath)) {
    return;
  }
  const { createDesktopSupabaseClient, getDesktopSupabaseRuntimeDiagnostics } =
    await import(`file:///${distPath.replace(/\\/g, "/")}`);
  const runtime = getDesktopSupabaseRuntimeDiagnostics();
  assert.equal(runtime.configuredWebSocketTransport, "ws");
  assert.equal(runtime.authRefreshTransportReady, true);
  const client = createDesktopSupabaseClient({
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "publishable-key",
  });
  assert.ok(client.auth);
  assert.ok(client.realtime);
});
