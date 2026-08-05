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

test("users page uses cloud access directory API", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(client, /localGetCloudAccessDirectory/);
  assert.match(client, /localGetCloudAccessDirectoryDiagnostics/);
});

test("directory diagnostics endpoint is exposed locally", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /directory\/diagnostics/);
});

test("cloud access bridge calls get_access_management_directory RPC", () => {
  const rpc = read("desktop/src/services/cloud-access-directory-rpc.ts");
  assert.match(rpc, /get_access_management_directory/);
});

test("offline and no-session states preserve cached directory", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /stale: true/);
  assert.match(localData, /fallbackReason: "no_session"/);
});

test("users client shows RPC diagnostic hints on failure", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(client, /diagnosticHint/);
  assert.match(client, /directoryRpcErrorCode/);
});
