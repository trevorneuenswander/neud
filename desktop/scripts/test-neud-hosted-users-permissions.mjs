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

test("hosted users page renders shared four-tab access management", () => {
  const page = read("src/app/portal/users/page.tsx");
  const tabs = read("src/components/access-management/AccessManagementTabs.tsx");
  assert.match(page, /CloudAccessManagementClient/);
  assert.match(page, /fetchAccessManagementDirectory/);
  assert.match(tabs, /Teams/);
  assert.match(tabs, /Users/);
  assert.match(tabs, /Project Access/);
  assert.match(tabs, /Invitations/);
});

test("shared access panels support search and scoped directories", () => {
  const usersPanel = read("src/components/access-management/UsersPanel.tsx");
  const projectPanel = read("src/components/access-management/ProjectAccessPanel.tsx");
  assert.match(usersPanel, /Search users/);
  assert.match(projectPanel, /Project access/);
  assert.match(projectPanel, /Access Source/);
  assert.match(projectPanel, /Assigned teams/);
});

test("cloud access directory RPC remains source for hosted users page", () => {
  const page = read("src/app/portal/users/page.tsx");
  const client = read("src/lib/access-management/directory-client.ts");
  const rpc = read("src/lib/access-management/directory-rpc.ts");
  assert.match(page, /fetchAccessManagementDirectory/);
  assert.match(client, /ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME/);
  assert.match(rpc, /get_access_management_directory/);
});
