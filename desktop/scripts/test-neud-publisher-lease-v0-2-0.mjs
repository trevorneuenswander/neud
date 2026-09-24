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

test("heartbeat cycle awaits syncProject for each publishing-enabled project", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /await this\.syncProject\(project\.id, "heartbeat"\)/);
  assert.doesNotMatch(manager, /void this\.syncProject\(project\.id, "heartbeat"\)/);
});

test("lease RPC responses are validated before heartbeat success is recorded", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const validator = read("desktop/src/services/publishing/publishing-lease-rpc.ts");
  assert.match(manager, /validateLeaseRpcResponse/);
  assert.match(manager, /verifyPublisherLeaseInCloud/);
  assert.match(manager, /heartbeatVerifiedInCloud/);
  assert.match(validator, /lease_expires_at/);
});

test("failed heartbeat cycle clears stale lastHeartbeatSuccessAt", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /leaseHeartbeatSucceeded/);
  assert.match(manager, /lastHeartbeatSuccessAt: null/);
});

test("eligible online viewer display re-enables cloud publishing during settings refresh", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /eligible && !enabled[\s\S]*ensureProjectPublishingEnabled/);
});

test("broad-arrow online diagnostic uses anon and authenticated viewer probes", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  assert.match(diagnose, /anonViewerProbe/);
  assert.match(diagnose, /authenticatedViewerProbe/);
  assert.match(diagnose, /project_publisher_leases/);
  assert.match(diagnose, /localState\.neudInstanceId/);
  assert.doesNotMatch(
    diagnose,
    /await admin\.rpc\("get_online_display_viewer_bundle"/,
  );
});

test("fresh session store clears stale refresh HTTP diagnostics", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /refreshHttpStatus: null/);
  assert.match(session, /refreshSupabaseErrorCode: null/);
  assert.match(session, /refreshSafeMessage: null/);
});

test("viewer bundle RPC diagnostic maps permission errors to concrete stages", () => {
  const lib = read("scripts/live-validation/lib/viewer-bundle-rpc-diagnostic.mjs");
  assert.match(lib, /viewer_rpc_permission_denied/);
  assert.match(lib, /publisher_lease_missing/);
});
