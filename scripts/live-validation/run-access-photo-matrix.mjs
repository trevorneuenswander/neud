#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import {
  createAccessTestFixtureTracker,
  cleanupAccessTestFixtures,
  parsePreserveFixturesFlag,
  trackAccessFixture,
} from "./lib/access-management-test-cleanup.mjs";
import { registerValidationFixture } from "./lib/validation-fixture-registry.mjs";
import {
  ACCESS_PHOTO_MATRIX_RPC_SPECS,
  createLiveValidationDbClient,
  verifyAccessPhotoMatrixRpcs,
} from "./lib/rpc-schema-probe.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";
import {
  ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
} from "./lib/directory-rpc-params.mjs";
import {
  createAdminClient,
  createAnonClient,
  createTestUser,
  expectRpc,
  makeEmail,
  makePassword,
  signInClient,
} from "./lib/supabase-test-helpers.mjs";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const preserveFixtures = parsePreserveFixturesFlag();

if (!url || !publishableKey || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const admin = createAdminClient(url, serviceRoleKey);
const results = [];
const fixtureTracker = createAccessTestFixtureTracker(`access-photo-${Date.now()}`);

function record(name, ok, details = {}) {
  results.push({ name, ...details, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${details.code ? ` (${details.code})` : ""}`);
}

function isAccessDenied(result) {
  if (result.ok === false) {
    return true;
  }

  const deniedCodes = new Set(["42501", "PGRST301", "forbidden", "authentication_required"]);
  if (deniedCodes.has(result.code)) {
    return true;
  }

  return typeof result.message === "string" && result.message.toLowerCase().includes("permission denied");
}

function classifyMutationFailure(result, expectedDenied = false) {
  if (expectedDenied) {
    if (result.ok === false) {
      return "permission_denied";
    }
    return "mutation_test_failed";
  }

  if (result.ok === true) {
    return "ok";
  }

  if (result.code === "forbidden" || result.code === "authentication_required") {
    return "permission_denied";
  }

  return "mutation_test_failed";
}

function writeResults(allPassed, stage, cleanupResult = null) {
  const outputPath = path.join(repoRoot, "docs", "access-photo-matrix-results.json");
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        probeMethod: "pg_proc catalog query via NEUD_SUPABASE_DB_URL",
        rpcSpecCount: ACCESS_PHOTO_MATRIX_RPC_SPECS.length,
        stage,
        testRunId: fixtureTracker.testRunId,
        preserveFixtures,
        cleanupResult,
        results,
        completedAt: new Date().toISOString(),
        allPassed,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outputPath}`);
  if (!allPassed || results.some((entry) => !entry.ok) || cleanupResult?.ok === false) {
    process.exitCode = 1;
  }
}

async function main() {
  const suffix = `${Date.now()}`;
  let dbClient;

  try {
    try {
      dbClient = await createLiveValidationDbClient();
      const probeResults = await verifyAccessPhotoMatrixRpcs(dbClient);

      for (const probe of probeResults) {
        const ok = probe.ok === true;
        record(`RPC exists: ${probe.name}`, ok, ok ? { code: "ok" } : { code: probe.code, message: probe.message });

        if (!ok && probe.required !== false) {
          writeResults(false, "rpc_presence", cleanupResult);
          return;
        }
      }
    } catch (error) {
      record("RPC schema probe", false, {
        code: "schema_probe_failed",
        message: sanitizeError(error).message,
      });
      writeResults(false, "rpc_presence", cleanupResult);
      return;
    } finally {
      if (dbClient) {
        await dbClient.end();
      }
    }

    const password = makePassword(suffix);
    const ownerEmail = makeEmail("access-owner", suffix);
    const outsiderEmail = makeEmail("access-outsider", suffix);

    const ownerId = await createTestUser(admin, {
      email: ownerEmail,
      password,
      role: "owner",
    });
    const outsiderId = await createTestUser(admin, {
      email: outsiderEmail,
      password,
      role: "user",
    });
    trackAccessFixture(fixtureTracker, "userIds", ownerId);
    trackAccessFixture(fixtureTracker, "userIds", outsiderId);
    registerValidationFixture({
      fixtureId: ownerId,
      fixtureType: "user",
      script: "run-access-photo-matrix.mjs",
    });
    registerValidationFixture({
      fixtureId: outsiderId,
      fixtureType: "user",
      script: "run-access-photo-matrix.mjs",
    });

    const ownerClient = await signInClient(url, publishableKey, ownerEmail, password);
    const outsiderClient = await signInClient(url, publishableKey, outsiderEmail, password);
    const anonClient = createAnonClient(url, publishableKey);

    const teamResult = await expectRpc(ownerClient, "create_team", {
      p_name: `Matrix Team ${suffix}`,
      p_description: "live matrix",
    });
    record("owner can create team", teamResult.ok === true, {
      ...teamResult,
      code: classifyMutationFailure(teamResult),
    });
    const teamId = teamResult.data?.team_id;
    trackAccessFixture(fixtureTracker, "teamIds", teamId);
    registerValidationFixture({
      fixtureId: teamId,
      fixtureType: "team",
      script: "run-access-photo-matrix.mjs",
    });

    const outsiderTeam = await expectRpc(outsiderClient, "create_team", {
      p_name: "Blocked Team",
      p_description: null,
    });
    record("non-owner cannot create team", outsiderTeam.ok === false, {
      ...outsiderTeam,
      code: classifyMutationFailure(outsiderTeam, true),
    });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const inviteEmail = makeEmail("invitee", suffix);
    const invite = await expectRpc(ownerClient, "create_cloud_invitation", {
      p_email: inviteEmail,
      p_team_id: teamId,
      p_team_role: "member",
      p_platform_role: null,
      p_token_hash: tokenHash,
      p_expires_at: new Date(Date.now() + 86400000).toISOString(),
      p_project_assignments: [],
    });
    record("owner can create invitation", invite.ok === true, {
      ...invite,
      code: classifyMutationFailure(invite),
    });
    trackAccessFixture(fixtureTracker, "invitationIds", invite.data?.invitation_id);
    registerValidationFixture({
      fixtureId: invite.data?.invitation_id,
      fixtureType: "invitation",
      script: "run-access-photo-matrix.mjs",
    });

    const duplicateInvite = await expectRpc(ownerClient, "create_cloud_invitation", {
      p_email: inviteEmail,
      p_team_id: teamId,
      p_team_role: "member",
      p_platform_role: null,
      p_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      p_expires_at: new Date(Date.now() + 86400000).toISOString(),
      p_project_assignments: [],
    });
    record(
      "duplicate pending invitation rejected",
      duplicateInvite.code === "duplicate_invitation",
      {
        ...duplicateInvite,
        code:
          duplicateInvite.code === "duplicate_invitation"
            ? "ok"
            : classifyMutationFailure(duplicateInvite),
      },
    );

    const resend = await expectRpc(ownerClient, "resend_cloud_invitation", {
      p_invitation_id: invite.data?.invitation_id,
      p_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      p_expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    record("owner can resend invitation", resend.ok === true, {
      ...resend,
      code: classifyMutationFailure(resend),
    });

    const revoke = await expectRpc(ownerClient, "revoke_cloud_invitation", {
      p_invitation_id: invite.data?.invitation_id,
    });
    record("owner can revoke invitation", revoke.ok === true, {
      ...revoke,
      code: classifyMutationFailure(revoke),
    });

    const replayAccept = await expectRpc(ownerClient, "accept_cloud_invitation", {
      p_token_hash: tokenHash,
    });
    record("revoked invitation accept rejected", replayAccept.ok === false, {
      ...replayAccept,
      code: classifyMutationFailure(replayAccept, true),
    });

    const anonDirectory = await expectRpc(
      anonClient,
      ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
      ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
    );
    record("anonymous cannot read access directory", isAccessDenied(anonDirectory), {
      ...anonDirectory,
      code: isAccessDenied(anonDirectory) ? "permission_denied" : classifyMutationFailure(anonDirectory, true),
    });

    const ownerDirectoryRpc = await ownerClient.rpc(
      ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
      ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
    );
    const { directoryContractValid } = await import("./lib/directory-rpc-diagnostics.mjs");
    const ownerDirectoryContract = ownerDirectoryRpc.data
      ? directoryContractValid(ownerDirectoryRpc.data)
      : { ok: false, stage: "directory_rpc_failed" };
    record(
      "owner can read access directory",
      !ownerDirectoryRpc.error && ownerDirectoryRpc.data?.ok === true && ownerDirectoryContract.ok === true,
      {
        ok:
          !ownerDirectoryRpc.error &&
          ownerDirectoryRpc.data?.ok === true &&
          ownerDirectoryContract.ok === true,
        code:
          !ownerDirectoryRpc.error && ownerDirectoryRpc.data?.ok === true && ownerDirectoryContract.ok === true
            ? "ok"
            : ownerDirectoryRpc.error?.code ?? ownerDirectoryRpc.data?.code ?? ownerDirectoryContract.code ?? "directory_contract_failed",
        stage: ownerDirectoryContract.stage ?? null,
        entityCounts: ownerDirectoryContract.counts ?? null,
      },
    );

    const anonPhoto = await expectRpc(anonClient, "authorize_hosted_photo_asset", {
      p_asset_id: "00000000-0000-0000-0000-000000000001",
      p_project_slug: "missing",
      p_display_slug: "missing",
    });
    record("anonymous unauthorized photo asset denied", anonPhoto.ok === false, {
      ...anonPhoto,
      code: classifyMutationFailure(anonPhoto, true),
    });

    writeResults(true, "complete");
  } catch (error) {
    record("access photo matrix", false, {
      code: "matrix_failed",
      message: sanitizeError(error).message,
    });
    writeResults(false, "matrix_failed");
  } finally {
    let cleanupDbClient;
    try {
      cleanupDbClient = await createLiveValidationDbClient();
      const cleanupResult = await cleanupAccessTestFixtures(
        cleanupDbClient,
        admin,
        fixtureTracker,
        { preserveFixtures },
      );
      if (!preserveFixtures) {
        console.log(
          `Cleanup counts: invitations=${cleanupResult.counts?.invitations ?? 0}, teams=${cleanupResult.counts?.teams ?? 0}, users=${cleanupResult.counts?.users ?? 0}, projects=${cleanupResult.counts?.projects ?? 0}`,
        );
        if (cleanupResult.errors?.length) {
          process.exitCode = 1;
        }
      }
    } catch (error) {
      console.error(`Fixture cleanup failed: ${sanitizeError(error).message}`);
      process.exitCode = 1;
    } finally {
      if (cleanupDbClient) {
        await cleanupDbClient.end().catch(() => {});
      }
    }
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
