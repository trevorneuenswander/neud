#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildDirectoryRpcDiagnosticsFromError,
  buildDirectoryRpcDiagnosticsFromPayload,
  classifyDirectoryRpcSafeCategory,
  directoryContractValid,
  parseCloudAccessDirectoryResponse,
} from "../../scripts/live-validation/lib/directory-rpc-diagnostics.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("042 migration replaces profiles.is_active with safe accountStatus", () => {
  const migration = read("supabase/migrations/042_fix_access_management_directory.sql");
  assert.match(migration, /042_fix_access_management_directory\.sql/);
  assert.match(migration, /'accountStatus', 'active'/);
  assert.doesNotMatch(migration, /p\.is_active/);
  assert.match(migration, /grant execute on function public\.get_access_management_directory\(\) to authenticated/);
});

test("041 migration still contains the profiles.is_active defect", () => {
  const migration = read("supabase/migrations/041_access_invitation_completion.sql");
  assert.match(migration, /p\.is_active/);
});

test("live migration runner includes 042 additively", () => {
  const applyScript = read("scripts/live-validation/apply-migrations.mjs");
  assert.match(applyScript, /042_fix_access_management_directory\.sql/);
  assert.doesNotMatch(applyScript, /041_access_invitation_completion\.sql[\s\S]*042[\s\S]*041/);
});

test("cloud access bridge records directory RPC diagnostics", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  const diagnostics = read("desktop/src/services/cloud-access-bridge-diagnostics.ts");
  const rpc = read("desktop/src/services/cloud-access-directory-rpc.ts");
  assert.match(bridge, /buildDirectoryRpcDiagnosticsFromError/);
  assert.match(bridge, /ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS/);
  assert.match(diagnostics, /DirectoryRpcDiagnostics/);
  assert.match(rpc, /directoryRpcPostgrestCode/);
  assert.match(rpc, /p_include_fixtures: false/);
});

test("local data service merges directory RPC diagnostics from bridge", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /directoryRpcPostgrestCode/);
  assert.match(service, /directoryRpcTopLevelKeys/);
});

test("missing column PostgREST error is classified as missing_column", () => {
  const category = classifyDirectoryRpcSafeCategory({
    code: "42703",
    message: 'column p.is_active does not exist',
  });
  assert.equal(category, "missing_column");
  const diagnostics = buildDirectoryRpcDiagnosticsFromError({
    code: "42703",
    message: 'column p.is_active does not exist',
  });
  assert.equal(diagnostics.directoryRpcFailureSection, "directory_queries");
});

test("RPC failure is not classified as offline", () => {
  const category = classifyDirectoryRpcSafeCategory({
    code: "42703",
    message: "column p.is_active does not exist",
  });
  assert.equal(category, "missing_column");
  const helpers = read("desktop/src/services/cloud-access-directory.ts");
  assert.match(helpers, /category === "missing_column"/);
  assert.match(helpers, /"directory_request_failed"/);
});

test("owner directory payload parses with required arrays", () => {
  const payload = {
    ok: true,
    teams: [{ id: "team-1" }],
    teamMemberships: [],
    users: [{ id: "user-1", platformRole: "owner" }],
    projects: [],
    projectMembers: [],
    projectTeams: [],
    invitations: [],
  };
  const contract = directoryContractValid(payload);
  assert.equal(contract.ok, true);
  assert.equal(contract.counts.teams, 1);
  assert.equal(contract.counts.users, 1);
});

test("empty teams and invitations normalize to arrays", () => {
  const payload = {
    ok: true,
    teams: null,
    teamMemberships: undefined,
    users: [],
    projects: [],
    projectMembers: [],
    projectTeams: [],
    invitations: null,
  };
  const parsed = parseCloudAccessDirectoryResponse(payload);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.teams, []);
  assert.deepEqual(parsed.invitations, []);
});

test("team admin scoped payload still satisfies parser contract", () => {
  const payload = {
    ok: true,
    teams: [{ id: "team-1" }],
    teamMemberships: [{ teamId: "team-1", userId: "user-2", role: "admin" }],
    users: [],
    projects: [{ id: "project-1" }],
    projectMembers: [],
    projectTeams: [],
    invitations: [],
  };
  assert.equal(directoryContractValid(payload).ok, true);
});

test("operator/viewer empty users array is valid contract", () => {
  const payload = {
    ok: true,
    teams: [],
    teamMemberships: [],
    users: [],
    projects: [],
    projectMembers: [],
    projectTeams: [],
    invitations: [],
  };
  assert.equal(directoryContractValid(payload).ok, true);
});

test("anonymous forbidden payload is parser failure not offline", () => {
  const payload = { ok: false, code: "forbidden" };
  const parsed = parseCloudAccessDirectoryResponse(payload);
  assert.equal(parsed.ok, false);
  const diagnostics = buildDirectoryRpcDiagnosticsFromPayload(payload);
  assert.equal(diagnostics.directoryRpcSafeCategory, "response_contract_mismatch");
});

test("unexpected RPC container type is response_contract_mismatch", () => {
  const diagnostics = buildDirectoryRpcDiagnosticsFromPayload([{ ok: true }]);
  assert.equal(diagnostics.directoryRpcSafeCategory, "response_contract_mismatch");
  assert.equal(diagnostics.directoryRpcFailureSection, "result_parsing");
});

test("successful RPC reports top-level keys and array counts only", () => {
  const diagnostics = buildDirectoryRpcDiagnosticsFromPayload({
    ok: true,
    teams: [],
    teamMemberships: [],
    users: [{ id: "1" }, { id: "2" }],
    projects: [],
    projectMembers: [],
    projectTeams: [],
    invitations: [],
  });
  assert.deepEqual(diagnostics.directoryRpcTopLevelKeys?.sort(), [
    "invitations",
    "ok",
    "projectMembers",
    "projectTeams",
    "projects",
    "teamMemberships",
    "teams",
    "users",
  ]);
  assert.deepEqual(diagnostics.directoryRpcEntityCounts, {
    teams: 0,
    users: 2,
    projects: 0,
    invitations: 0,
  });
});

test("hosted directory client normalizes null arrays", () => {
  const client = read("src/lib/access-management/directory-client.ts");
  assert.match(client, /payload\.teams \?\? \[\]/);
  assert.match(client, /payload\.invitations \?\? \[\]/);
});

test("diagnose script reports safe RPC diagnostics without personal data", () => {
  const script = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(script, /directoryRpcPostgrestCode/);
  assert.match(script, /buildDirectoryRpcDiagnosticsFromPayload/);
  assert.match(script, /entityCounts/);
  assert.match(script, /No emails, tokens, user records/);
  assert.match(script, /pg_get_functiondef/);
});

test("diagnostic script contains no bare undefined anon reference", () => {
  const script = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(script, /createAnonClient/);
  assert.match(script, /anonClient/);
  assert.doesNotMatch(script, /\bawait anon\.rpc\b/);
  assert.doesNotMatch(script, /\bconst anon =/);
});

test("diagnostic script runs anonymous denial probe in isolated try/catch", () => {
  const script = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(script, /probeAnonymousDenial/);
  assert.match(script, /anonymousProbeResult/);
  assert.match(script, /authenticatedProbeResult/);
});

test("diagnostic script writes output even when probes fail", () => {
  const script = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(script, /function writeSummary/);
  assert.match(script, /writeSummary\(summary\)/);
  assert.match(script, /main\(\)\.catch/);
  assert.match(script, /diagnosticScriptError/);
});

test("diagnostic script reports migration 042 tracking state", () => {
  const script = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(script, /migration042FilePresent/);
  assert.match(script, /migration042Applied/);
  assert.match(script, /migrationTracking/);
});

test("authenticated probe still runs when anonymous probe is isolated", () => {
  const script = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  const anonymousIndex = script.indexOf("anonymousProbeResult");
  const authenticatedIndex = script.indexOf("authenticatedProbeResult = await probeAuthenticatedDirectoryRpc");
  assert.ok(anonymousIndex >= 0);
  assert.ok(authenticatedIndex > anonymousIndex);
});

test("access photo matrix includes owner directory contract test", () => {
  const matrix = read("scripts/live-validation/run-access-photo-matrix.mjs");
  assert.match(matrix, /owner can read access directory/);
  assert.match(matrix, /directoryContractValid/);
});

test("local API returns structured success path remains intact", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(server, /return sendJson\(response, 200, result\)/);
  assert.match(service, /cacheWriteSucceeded = true/);
});

test("desktop parser uses camelCase contract keys", () => {
  const helpers = read("desktop/src/services/cloud-access-directory.ts");
  assert.match(helpers, /teamMemberships/);
  assert.match(helpers, /projectMembers/);
  assert.match(helpers, /projectTeams/);
});

test("live function definition audit checks profiles.is_active", () => {
  const diagnoseLib = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(diagnoseLib, /liveDefinitionHasProfilesIsActive/);
});
