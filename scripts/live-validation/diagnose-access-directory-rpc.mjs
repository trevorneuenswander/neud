#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import {
  buildDirectoryRpcDiagnosticsFromError,
  buildDirectoryRpcDiagnosticsFromPayload,
  directoryContractValid,
} from "./lib/directory-rpc-diagnostics.mjs";
import {
  createLiveValidationDbClient,
  matchRpcSpec,
  queryPublicFunctionOverloads,
} from "./lib/rpc-schema-probe.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";
import {
  ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE,
} from "./lib/directory-rpc-params.mjs";
import {
  openLocalSettingsDatabase,
  readSharedCloudAuthDiagnostics,
} from "./lib/shared-cloud-auth-diagnostics.mjs";
import {
  probeLocalAccessManagementApi,
  resolveLocalApiOrigin,
} from "./lib/shared-local-api-origin.mjs";
import {
  createAdminClient,
  createAnonClient,
  createTestUser,
  makeEmail,
  makePassword,
  signInClient,
} from "./lib/supabase-test-helpers.mjs";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);

const MIGRATION_042 = "042_fix_access_management_directory.sql";
const MIGRATION_044 = "044_exclude_validation_fixtures_from_directory.sql";
const OUTPUT_PATH = path.join(repoRoot, "docs", "access-directory-rpc-diagnostic.json");

function migrationFilePresent() {
  return fs.existsSync(path.join(repoRoot, "supabase", "migrations", MIGRATION_042));
}

function migration042ReferencesIsActiveBug() {
  const sql = fs.readFileSync(
    path.join(repoRoot, "supabase", "migrations", MIGRATION_042),
    "utf8",
  );
  return sql.includes("p.is_active");
}

function createBaseSummary() {
  return {
    completedAt: null,
    diagnosticScriptError: null,
    migration042FilePresent: migrationFilePresent(),
    migration042FixesProfilesIsActive: migrationFilePresent() && !migration042ReferencesIsActiveBug(),
    migrationTracking: null,
    functionCatalog: null,
    functionSignature: ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE,
    anonymousProbeResult: null,
    authenticatedProbeResult: null,
    authenticatedCallerAvailable: false,
    callerAuthorizationResult: null,
    rpcSuccess: false,
    parserSuccess: false,
    firstFailingStage: "unknown",
    localApi: null,
    sharedCloudAuth: null,
    notes: [
      "No emails, tokens, user records, or directory payloads are included.",
      "Apply migration 042 with npm run apply:live-migrations when ready.",
    ],
  };
}

function writeSummary(summary) {
  summary.completedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

async function probeMigrationAndFunctionCatalog(dbClient) {
  const functionCatalog = await probeFunctionCatalog(dbClient);
  const migrationTracking = await probeMigrationApplied(dbClient);
  return { functionCatalog, migrationTracking };
}

async function probeFunctionCatalog(dbClient) {
  const rows = await queryPublicFunctionOverloads(dbClient, "get_access_management_directory");
  const match = matchRpcSpec(rows, {
    name: ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
    expectedArgumentNames: ["p_include_fixtures"],
  });

  let liveDefinitionHasIsActive = null;
  if (rows.length > 0) {
    const { rows: definitionRows } = await dbClient.query(
      `
        select pg_get_functiondef(p.oid) as definition
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'get_access_management_directory'
        order by p.oid desc
        limit 1
      `,
    );
    const definition = definitionRows[0]?.definition ?? "";
    liveDefinitionHasIsActive = definition.includes("p.is_active");
  }

  return {
    functionPresent: match.ok === true,
    functionSignature: match.identityArguments ?? ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE,
    signatureMatch: match.code ?? null,
    liveDefinitionHasProfilesIsActive: liveDefinitionHasIsActive,
  };
}

async function probeMigrationApplied(dbClient) {
  const { rows: rows042 } = await dbClient.query(
    `
      select migration_name, checksum
      from public._neud_validation_migrations
      where migration_name = $1
    `,
    [MIGRATION_042],
  );
  const { rows: rows044 } = await dbClient.query(
    `
      select migration_name, checksum
      from public._neud_validation_migrations
      where migration_name = $1
    `,
    [MIGRATION_044],
  );
  return {
    migration042Applied: rows042.length > 0,
    migration042Checksum: rows042[0]?.checksum ?? null,
    migration044Applied: rows044.length > 0,
    migration044Checksum: rows044[0]?.checksum ?? null,
  };
}

async function probeAnonymousDenial(url, publishableKey) {
  const anonClient = createAnonClient(url, publishableKey);
  const { data, error } = await anonClient.rpc(
    ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
    ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  );

  if (error) {
    const diagnostics = buildDirectoryRpcDiagnosticsFromError(error);
    return {
      probe: "anonymous",
      denied: true,
      safeCategory: diagnostics.directoryRpcSafeCategory,
      postgrestCode: diagnostics.directoryRpcPostgrestCode,
      probeSuccess: true,
    };
  }

  return {
    probe: "anonymous",
    denied: data?.ok === false,
    safeCategory: data?.ok === false ? "permission_denied" : "unknown_rpc_error",
    postgrestCode: null,
    probeSuccess: data?.ok === false,
  };
}

async function resolveAuthenticatedClient(url, publishableKey, serviceRoleKey) {
  const ownerEmail =
    process.env.NEUD_LIVE_VALIDATION_OWNER_EMAIL?.trim() ??
    process.env.NEUD_LIVE_VALIDATION_VIEWER_EMAIL?.trim();
  const ownerPassword =
    process.env.NEUD_LIVE_VALIDATION_OWNER_PASSWORD?.trim() ??
    process.env.NEUD_LIVE_VALIDATION_VIEWER_PASSWORD?.trim();

  if (ownerEmail && ownerPassword) {
    return {
      authenticatedClient: await signInClient(url, publishableKey, ownerEmail, ownerPassword),
      authSource: "env_credentials",
    };
  }

  const adminClient = createAdminClient(url, serviceRoleKey);
  const suffix = `${Date.now()}`;
  const email = makeEmail("directory-diagnose", suffix);
  const password = makePassword(suffix);
  await createTestUser(adminClient, { email, password, role: "owner" });
  return {
    authenticatedClient: await signInClient(url, publishableKey, email, password),
    authSource: "ephemeral_owner",
  };
}

async function probeCallerAuthorization(authenticatedClient) {
  const { data: userData } = await authenticatedClient.auth.getUser();
  const uid = userData.user?.id ?? null;
  if (!uid) {
    return {
      directoryRpcCallerUidPresent: false,
      directoryRpcCallerAuthorized: false,
      directoryRpcCallerPlatformRole: null,
      directoryRpcCallerTeamMembershipCount: null,
    };
  }

  const { data: profile } = await authenticatedClient
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();
  const { count } = await authenticatedClient
    .from("team_memberships")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("status", "active");

  const role = typeof profile?.role === "string" ? profile.role : null;
  const isPlatformAuthorized = role === "owner" || role === "admin";

  return {
    directoryRpcCallerUidPresent: true,
    directoryRpcCallerAuthorized: isPlatformAuthorized || (count ?? 0) > 0,
    directoryRpcCallerPlatformRole: role,
    directoryRpcCallerTeamMembershipCount: count ?? 0,
  };
}

async function probeAuthenticatedDirectoryRpc(authenticatedClient) {
  const caller = await probeCallerAuthorization(authenticatedClient);
  const { data, error } = await authenticatedClient.rpc(
    ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
    ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  );

  if (error) {
    return {
      probe: "authenticated",
      rpcSuccess: false,
      parserSuccess: false,
      parserContract: null,
      firstFailingStage: "directory_rpc_failed",
      ...buildDirectoryRpcDiagnosticsFromError(error, caller),
    };
  }

  const rpcDiagnostics = buildDirectoryRpcDiagnosticsFromPayload(data, caller);
  const parserContract = directoryContractValid(data);

  return {
    probe: "authenticated",
    rpcSuccess: parserContract.ok,
    parserSuccess: parserContract.ok,
    parserContract: {
      ok: parserContract.ok,
      stage: parserContract.stage ?? "none",
      code: parserContract.code ?? null,
      entityCounts: parserContract.counts ?? null,
    },
    firstFailingStage: parserContract.ok ? "none" : parserContract.stage ?? "result_parsing",
    ...rpcDiagnostics,
  };
}

async function probeLocalApi(settings) {
  const originResolution = resolveLocalApiOrigin({ settings });
  if (!originResolution.sessionToken) {
    return {
      localApiReachable: false,
      localApiDirectoryResult: "session_token_missing",
    };
  }

  const probe = await probeLocalAccessManagementApi({ settings });
  const contract = probe.directoryPayload ? directoryContractValid(probe.directoryPayload) : null;

  return {
    localApiReachable: probe.localApiReachable ?? false,
    localApiDirectoryResult: probe.cloudDirectoryRequestResult ?? "not_attempted",
    localApiDirectoryParsed: probe.directoryResponseParsed ?? false,
    localApiFallbackReason: probe.actualFallbackReason ?? null,
    localApiDirectoryRpcResult: probe.cloudDirectoryRpcResult ?? null,
    localApiFirstFailureStage: probe.firstCloudAccessFailureStage ?? null,
    localApiParserSuccess: contract?.ok ?? false,
    localApiEntityCounts: probe.cloudDirectoryEntityCounts ?? null,
    directoryRpcPostgrestCode: probe.directoryRpcPostgrestCode ?? null,
    directoryRpcSqlState: probe.directoryRpcSqlState ?? null,
    directoryRpcSafeCategory: probe.directoryRpcSafeCategory ?? null,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const summary = createBaseSummary();
  let dbClient;

  if (!url || !publishableKey || !serviceRoleKey) {
    summary.diagnosticScriptError = "Missing Supabase env vars for directory RPC diagnosis.";
    summary.firstFailingStage = "configuration_missing";
    writeSummary(summary);
    process.exitCode = 1;
    return;
  }

  try {
    try {
      dbClient = await createLiveValidationDbClient();
      const catalog = await probeMigrationAndFunctionCatalog(dbClient);
      summary.functionCatalog = catalog.functionCatalog;
      summary.migrationTracking = catalog.migrationTracking;
    } catch (error) {
      summary.functionCatalog = {
        functionPresent: null,
        probeError: sanitizeError(error).message,
      };
      summary.migrationTracking = {
        migration042Applied: null,
        probeError: sanitizeError(error).message,
      };
    }

    try {
      summary.anonymousProbeResult = await probeAnonymousDenial(url, publishableKey);
    } catch (error) {
      summary.anonymousProbeResult = {
        probe: "anonymous",
        probeSuccess: false,
        denied: null,
        probeError: sanitizeError(error).message,
      };
    }

    try {
      const { authenticatedClient, authSource } = await resolveAuthenticatedClient(
        url,
        publishableKey,
        serviceRoleKey,
      );
      summary.authenticatedCallerAvailable = true;
      summary.authSource = authSource;
      summary.authenticatedProbeResult = await probeAuthenticatedDirectoryRpc(authenticatedClient);
      summary.callerAuthorizationResult =
        summary.authenticatedProbeResult.directoryRpcCallerAuthorized ?? null;
      summary.rpcSuccess = summary.authenticatedProbeResult.rpcSuccess === true;
      summary.parserSuccess = summary.authenticatedProbeResult.parserSuccess === true;
      summary.firstFailingStage = summary.authenticatedProbeResult.firstFailingStage ?? "unknown";
    } catch (error) {
      summary.authenticatedProbeResult = {
        probe: "authenticated",
        rpcSuccess: false,
        parserSuccess: false,
        firstFailingStage: "authentication_failed",
        directoryRpcSafeMessage: sanitizeError(error).message.slice(0, 240),
        directoryRpcSafeCategory: "unknown_rpc_error",
        probeError: sanitizeError(error).message,
      };
      summary.firstFailingStage = "authentication_failed";
    }

    try {
      const databasePath =
        process.env.NEUD_LOCAL_DATABASE_PATH?.trim() ??
        path.join(
          process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
          "NEUD",
          "data",
          "neud.sqlite",
        );
      if (fs.existsSync(databasePath)) {
        const settings = await openLocalSettingsDatabase(databasePath, repoRoot);
        summary.sharedCloudAuth = readSharedCloudAuthDiagnostics(settings);
        summary.localApi = await probeLocalApi(settings);
      }
    } catch (error) {
      summary.localApi = {
        localApiReachable: false,
        probeError: sanitizeError(error).message,
      };
    }
  } catch (error) {
    summary.diagnosticScriptError = sanitizeError(error).message;
    if (summary.firstFailingStage === "unknown") {
      summary.firstFailingStage = "diagnostic_script_failed";
    }
  } finally {
    if (dbClient) {
      await dbClient.end().catch(() => {});
    }
    writeSummary(summary);
    if (summary.diagnosticScriptError || !summary.rpcSuccess || !summary.parserSuccess) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  const summary = createBaseSummary();
  summary.diagnosticScriptError = sanitizeError(error).message;
  summary.firstFailingStage = "diagnostic_script_failed";
  writeSummary(summary);
  process.exit(1);
});
