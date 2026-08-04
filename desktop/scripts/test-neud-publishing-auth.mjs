#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkFiles(dir, matches = []) {
  if (!fs.existsSync(dir)) {
    return matches;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matches);
    } else if (/\.(js|mjs|cjs|json|html|txt|env)$/i.test(entry.name)) {
      matches.push(fullPath);
    }
  }
  return matches;
}

test("PublishingManager uses shared authenticated cloud coordinator", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const main = read("desktop/src/main.ts");

  assert.match(manager, /AuthenticatedCloudCoordinator/);
  assert.match(manager, /acquireAuthenticatedClient/);
  assert.match(manager, /getCloudClient/);
  assert.match(manager, /getAuthSnapshot|isAuthenticatedCloudSessionAvailable|cloud\.hasRestorableCloudSession/);
  assert.match(manager, /registerHostedProject/);
  assert.doesNotMatch(manager, /getSupabaseMain/);
  assert.doesNotMatch(manager, /service_role/);
  assert.doesNotMatch(manager, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(main, /new SupabaseUserSessionService/);
  assert.match(main, /new PublishingManager\(\s*\n\s*authenticatedCloud,/);
  assert.match(main, /loadSupabasePublicConfig/);
});

test("cloud publishing client does not reference service role secrets", () => {
  const client = read("desktop/src/services/publishing/cloud-publishing-client.ts");
  assert.doesNotMatch(client, /service_role/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(client, /register_hosted_project_for_desktop/);
});

test("sign-in stores Supabase cloud session tokens through IPC", () => {
  const signIn = read("src/lib/auth/client-sign-in.ts");
  const authIpc = read("desktop/src/ipc/auth.ts");
  const sessionService = read("desktop/src/services/supabase-user-session.ts");

  assert.match(signIn, /handoffTarget: "desktop"/);
  assert.match(signIn, /requiresDesktopMainSessionHandoff/);
  assert.match(signIn, /buildDesktopCloudSessionPayload/);
  assert.match(authIpc, /handoffTarget === "desktop"/);
  assert.match(sessionService, /safeStorage/);
  assert.match(sessionService, /clearSession/);
  assert.match(sessionService, /refreshSession/);
});

test("built desktop dist publishing path avoids service-role env usage", () => {
  const distPublishingDir = path.join(desktopRoot, "dist", "services", "publishing");
  const files = walkFiles(distPublishingDir);
  assert.ok(files.length > 0, "expected built publishing services");

  for (const filePath of files) {
    const contents = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(contents, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(contents, /service_role/);
  }
});

test("payload UTF-8 byte counting matches server semantics in manager", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /Buffer\.byteLength\(JSON\.stringify\(payload\), "utf8"\)/);

  const sample = { note: "café" };
  const bytes = Buffer.byteLength(JSON.stringify(sample), "utf8");
  assert.ok(bytes > JSON.stringify(sample).length, "multibyte payload should exceed character count");
});

test("recoverable publishing errors exclude cloud authorization failures", async () => {
  const { isRecoverablePublishingError } = await import(
    new URL("../dist/services/publishing/types.js", import.meta.url).href
  );

  assert.equal(isRecoverablePublishingError("forbidden"), false);
  assert.equal(isRecoverablePublishingError("authentication_required"), false);
});
