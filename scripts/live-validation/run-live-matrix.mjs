#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";
import {
  addProjectMember,
  createAdminClient,
  createAnonClient,
  createTestUser,
  expectRpc,
  makeEmail,
  makePassword,
  signInClient,
} from "./lib/supabase-test-helpers.mjs";
import {
  cleanupAccessTestFixtures,
  createAccessTestFixtureTracker,
  parsePreserveFixturesFlag,
  trackAccessFixture,
} from "./lib/access-management-test-cleanup.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { registerValidationFixture } from "./lib/validation-fixture-registry.mjs";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const admin = createAdminClient(url, serviceRoleKey);
const results = [];
const preserveFixtures = parsePreserveFixturesFlag();
const fixtureTracker = createAccessTestFixtureTracker(`live-matrix-${Date.now()}`);

function trackValidationProject(projectId) {
  trackAccessFixture(fixtureTracker, "projectIds", projectId);
  registerValidationFixture({
    fixtureId: projectId,
    fixtureType: "project",
    script: "run-live-matrix.mjs",
  });
}

function record(name, ok, details = {}) {
  results.push({ name, ok, ...details });
  console.log(`${ok ? "✔" : "✖"} ${name}${details.code ? ` (${details.code})` : ""}`);
}

function snapshotParams({
  projectId,
  publisherInstanceId,
  revision,
  payload,
  payloadHash,
  sourceMode = "webpage-scraper",
  sourceConnected = true,
}) {
  return {
    p_project_id: projectId,
    p_publisher_instance_id: publisherInstanceId,
    p_contract_version: "1",
    p_revision: revision,
    p_generated_at: new Date().toISOString(),
    p_source_mode: sourceMode,
    p_source_connected: sourceConnected,
    p_payload: payload,
    p_payload_hash: payloadHash,
  };
}

function makeHostedDisplayRow({ id, projectId, name, slug, instanceId, enabled = true }) {
  return {
    id,
    project_id: projectId,
    name,
    slug,
    display_type: "project-html",
    enabled,
    source_instance_id: instanceId,
    sync_version: 1,
  };
}

function makeActivityEvent({
  id,
  projectId,
  eventType,
  description,
  instanceId,
  metadata,
  userId,
}) {
  const occurredAt = new Date().toISOString();
  return {
    id,
    project_id: projectId,
    event_type: eventType,
    description,
    source_instance_id: instanceId,
    occurred_at: occurredAt,
    ...(metadata ? { metadata } : {}),
    ...(userId ? { user_id: userId } : {}),
  };
}

function isAnonymousRpcDenied(result) {
  return result.ok || result.code === "42501" || result.code === "authentication_required";
}

async function main() {
  const { error: publishingTableError } = await admin
    .from("project_publishing_settings")
    .select("project_id")
    .limit(1);
  if (publishingTableError) {
    console.error("Publishing tables unavailable. Run: npm run apply:live-migrations");
    process.exit(1);
  }

  const suffix = Date.now().toString(36);
  const password = makePassword(suffix);
  const anon = createAnonClient(url, publishableKey);

  try {
  const projectA = randomUUID();
  const projectB = randomUUID();
  const instanceA = randomUUID();
  const instanceB = randomUUID();

  const ownerId = await createTestUser(admin, {
    email: makeEmail("live-owner", suffix),
    password,
    role: "owner",
  });
  trackAccessFixture(fixtureTracker, "userIds", ownerId);
  const adminId = await createTestUser(admin, {
    email: makeEmail("live-admin", suffix),
    password,
    role: "admin",
  });
  trackAccessFixture(fixtureTracker, "userIds", adminId);
  const managerAId = await createTestUser(admin, {
    email: makeEmail("live-manager-a", suffix),
    password,
  });
  trackAccessFixture(fixtureTracker, "userIds", managerAId);
  const operatorAId = await createTestUser(admin, {
    email: makeEmail("live-operator-a", suffix),
    password,
  });
  trackAccessFixture(fixtureTracker, "userIds", operatorAId);
  const viewerAId = await createTestUser(admin, {
    email: makeEmail("live-viewer-a", suffix),
    password,
  });
  trackAccessFixture(fixtureTracker, "userIds", viewerAId);
  const outsiderId = await createTestUser(admin, {
    email: makeEmail("live-outsider", suffix),
    password,
  });
  trackAccessFixture(fixtureTracker, "userIds", outsiderId);
  const managerBId = await createTestUser(admin, {
    email: makeEmail("live-manager-b", suffix),
    password,
  });
  trackAccessFixture(fixtureTracker, "userIds", managerBId);

  const ownerClient = await signInClient(url, publishableKey, makeEmail("live-owner", suffix), password);
  const adminClient = await signInClient(url, publishableKey, makeEmail("live-admin", suffix), password);
  const managerAClient = await signInClient(
    url,
    publishableKey,
    makeEmail("live-manager-a", suffix),
    password,
  );
  const operatorAClient = await signInClient(
    url,
    publishableKey,
    makeEmail("live-operator-a", suffix),
    password,
  );
  const viewerAClient = await signInClient(
    url,
    publishableKey,
    makeEmail("live-viewer-a", suffix),
    password,
  );
  const outsiderClient = await signInClient(
    url,
    publishableKey,
    makeEmail("live-outsider", suffix),
    password,
  );
  const managerBClient = await signInClient(
    url,
    publishableKey,
    makeEmail("live-manager-b", suffix),
    password,
  );

  // Registration / 021 hardening
  const anonRegister = await expectRpc(anon, "register_hosted_project_for_desktop", {
    p_project_id: randomUUID(),
    p_slug: `anon-${suffix}`,
    p_name: "Anon Test",
  }, "authentication_required");
  record("anonymous registration denied", isAnonymousRpcDenied(anonRegister), {
    code: anonRegister.code,
  });

  const registerA = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
    p_project_id: projectA,
    p_slug: `neud-validation-live-a-${suffix}`,
    p_name: "[NEUD Validation] Live Project A",
  }, "project_registered");
  record("manager registers project A", registerA.ok, { code: registerA.code });
  if (registerA.ok) {
    trackValidationProject(projectA);
  }

  await addProjectMember(admin, projectA, operatorAId, "operator");
  await addProjectMember(admin, projectA, viewerAId, "viewer");

  const registerB = await expectRpc(managerBClient, "register_hosted_project_for_desktop", {
    p_project_id: projectB,
    p_slug: `neud-validation-live-b-${suffix}`,
    p_name: "[NEUD Validation] Live Project B",
  }, "project_registered");
  record("manager registers project B", registerB.ok, { code: registerB.code });
  if (registerB.ok) {
    trackValidationProject(projectB);
  }

  const idempotentA = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
    p_project_id: projectA,
    p_slug: `neud-validation-live-a-${suffix}`,
    p_name: "Live Project A",
  }, "project_registered");
  record("idempotent project A registration", idempotentA.ok, { code: idempotentA.code });

  const takeover = await expectRpc(outsiderClient, "register_hosted_project_for_desktop", {
    p_project_id: projectA,
    p_slug: `neud-validation-live-a-${suffix}`,
    p_name: "Live Project A",
  }, "forbidden");
  record("outsider cannot claim existing project UUID", takeover.ok, { code: takeover.code });

  const slugConflict = await expectRpc(managerBClient, "register_hosted_project_for_desktop", {
    p_project_id: randomUUID(),
    p_slug: `neud-validation-live-a-${suffix}`,
    p_name: "Slug Conflict",
  }, "slug_conflict");
  record("slug conflict rejected", slugConflict.ok, { code: slugConflict.code });

  const reservedSlug = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
    p_project_id: randomUUID(),
    p_slug: "admin",
    p_name: "Reserved",
  }, "slug_reserved");
  record("reserved slug rejected", reservedSlug.ok, { code: reservedSlug.code });

  const invalidSlug = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
    p_project_id: randomUUID(),
    p_slug: "Bad_Slug!",
    p_name: "Invalid Slug",
  }, "invalid_input");
  record("invalid slug rejected", invalidSlug.ok, { code: invalidSlug.code });

  const longName = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
    p_project_id: randomUUID(),
    p_slug: `long-name-${suffix}`,
    p_name: "x".repeat(121),
  }, "invalid_input");
  record("excessive name length rejected", longName.ok, { code: longName.code });

  const auditCheck = await admin
    .from("cloud_project_registration_audit")
    .select("user_id, project_id, result_code")
    .eq("project_id", projectA)
    .eq("result_code", "project_registered")
    .limit(1);
  record(
    "successful registration writes audit row",
    !auditCheck.error && (auditCheck.data?.length ?? 0) > 0,
    { rows: auditCheck.data?.length ?? 0 },
  );

  const membershipCheck = await admin
    .from("project_members")
    .select("access_level")
    .eq("project_id", projectA)
    .eq("user_id", managerAId)
    .maybeSingle();
  record(
    "successful registration creates manager membership",
    membershipCheck.data?.access_level === "manager",
    { access_level: membershipCheck.data?.access_level },
  );

  const rateLimitHits = [];
  for (let index = 0; index < 3; index += 1) {
    const rateProjectId = randomUUID();
    const attempt = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
      p_project_id: rateProjectId,
      p_slug: `neud-validation-rate-${suffix}-${index}`,
      p_name: `[NEUD Validation] Rate ${index}`,
    }, "project_registered");
    rateLimitHits.push(attempt.code);
    if (attempt.ok) {
      trackValidationProject(rateProjectId);
    }
  }
  const fourthAttempt = await expectRpc(managerAClient, "register_hosted_project_for_desktop", {
    p_project_id: randomUUID(),
    p_slug: `neud-validation-rate-${suffix}-blocked`,
    p_name: "[NEUD Validation] Rate Blocked",
  }, "registration_limit_reached");
  record("fourth registration within five minutes rejected", fourthAttempt.ok, {
    code: fourthAttempt.code,
    priorCodes: rateLimitHits,
  });

  // Publishing settings matrix
  const anonEnable = await expectRpc(anon, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: true,
  }, "authentication_required");
  record("anonymous denied publishing settings", isAnonymousRpcDenied(anonEnable), {
    code: anonEnable.code,
  });

  const ownerEnable = await expectRpc(ownerClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: true,
  }, "settings_updated");
  record("platform owner enables publishing", ownerEnable.ok, { code: ownerEnable.code });

  const adminEnable = await expectRpc(adminClient, "set_project_online_publishing_enabled", {
    p_project_id: projectB,
    p_enabled: true,
  }, "settings_updated");
  record("platform admin enables publishing on project B", adminEnable.ok, { code: adminEnable.code });

  const managerEnable = await expectRpc(managerAClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: true,
  }, "settings_updated");
  record("manager enables publishing", managerEnable.ok, { code: managerEnable.code });

  const operatorEnable = await expectRpc(operatorAClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: false,
  }, "forbidden");
  record("operator denied publishing settings", operatorEnable.ok, { code: operatorEnable.code });

  const viewerEnable = await expectRpc(viewerAClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: false,
  }, "forbidden");
  record("viewer denied publishing settings", viewerEnable.ok, { code: viewerEnable.code });

  const outsiderEnable = await expectRpc(outsiderClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: false,
  }, "forbidden");
  record("non-member denied publishing settings", outsiderEnable.ok, { code: outsiderEnable.code });

  // Lease matrix
  const managerLease = await expectRpc(managerAClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceA,
    p_lease_duration_seconds: 90,
  }, "lease_acquired");
  record("manager acquires publisher lease", managerLease.ok, { code: managerLease.code });

  const secondInstance = await expectRpc(operatorAClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceB,
    p_lease_duration_seconds: 90,
  }, "lease_conflict");
  record("second-instance lease conflict", secondInstance.ok, { code: secondInstance.code });

  const renewOk = await expectRpc(managerAClient, "renew_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceA,
    p_lease_duration_seconds: 90,
  }, "lease_renewed");
  record("correct-owner lease renewal", renewOk.ok, { code: renewOk.code });

  const renewWrong = await expectRpc(managerAClient, "renew_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceB,
    p_lease_duration_seconds: 90,
  }, "lease_not_owned");
  record("wrong-instance lease renewal rejected", renewWrong.ok, { code: renewWrong.code });

  const viewerLease = await expectRpc(viewerAClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: randomUUID(),
    p_lease_duration_seconds: 90,
  }, "forbidden");
  record("viewer lease acquisition rejected", viewerLease.ok, { code: viewerLease.code });

  const outsiderLease = await expectRpc(outsiderClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: randomUUID(),
    p_lease_duration_seconds: 90,
  }, "forbidden");
  record("non-member lease acquisition rejected", outsiderLease.ok, { code: outsiderLease.code });

  const releaseLease = await expectRpc(managerAClient, "release_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceA,
  }, "lease_released");
  record("manager releases lease", releaseLease.ok, { code: releaseLease.code });

  const reacquire = await expectRpc(operatorAClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceB,
    p_lease_duration_seconds: 90,
  }, "lease_acquired");
  record("operator reacquires released lease", reacquire.ok, { code: reacquire.code });

  await expectRpc(managerAClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: false,
  }, "settings_updated");

  const disabledLease = await expectRpc(operatorAClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: randomUUID(),
    p_lease_duration_seconds: 90,
  }, "publishing_disabled");
  record("disabled publishing lease rejected", disabledLease.ok, { code: disabledLease.code });

  await expectRpc(managerAClient, "set_project_online_publishing_enabled", {
    p_project_id: projectA,
    p_enabled: true,
  }, "settings_updated");
  await expectRpc(operatorAClient, "acquire_project_publisher_lease", {
    p_project_id: projectA,
    p_publisher_instance_id: instanceA,
    p_lease_duration_seconds: 90,
  }, "lease_acquired");

  // Snapshot matrix
  const payload = { lot: 1, title: "Test Vehicle", bid: 1000 };
  const payloadHash = "abc123";
  const publishOk = await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 1,
      payload,
      payloadHash,
    }),
    "published",
  );
  record("operator publishes canonical snapshot", publishOk.ok, { code: publishOk.code });

  const duplicateUnchanged = await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 1,
      payload,
      payloadHash,
    }),
    "duplicate_unchanged",
  );
  record(
    "duplicate unchanged snapshot accepted idempotently",
    duplicateUnchanged.ok,
    { code: duplicateUnchanged.code },
  );

  const revision2Payload = { lot: 2, title: "Second Lot Vehicle", bid: 2000 };
  const revision2PayloadHash = "rev2hash";
  await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 2,
      payload: revision2Payload,
      payloadHash: revision2PayloadHash,
    }),
    "published",
  );

  const stalePayload = { lot: 1, title: "Test Vehicle Updated", bid: 1500 };
  const stalePayloadHash = "def789";
  const staleRevision = await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 1,
      payload: stalePayload,
      payloadHash: stalePayloadHash,
    }),
    "stale_revision",
  );
  record("stale revision rejected", staleRevision.ok, { code: staleRevision.code });

  const wrongInstancePublish = await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceB,
      revision: 2,
      payload,
      payloadHash: "def456",
    }),
    "lease_not_owned",
  );
  record("wrong-instance snapshot rejected", wrongInstancePublish.ok, { code: wrongInstancePublish.code });

  const viewerPublish = await expectRpc(
    viewerAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 2,
      payload,
      payloadHash: "viewer-hash",
    }),
    "forbidden",
  );
  record("viewer snapshot publish rejected", viewerPublish.ok, { code: viewerPublish.code });

  const oversizedPayload = { blob: "x".repeat(1_048_577) };
  const oversized = await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 2,
      payload: oversizedPayload,
      payloadHash: "oversized",
    }),
    "payload_too_large",
  );
  record("over-1-MB snapshot rejected", oversized.ok, { code: oversized.code });

  const utf8Payload = { title: "🚗".repeat(300_000) };
  const utf8Attempt = await expectRpc(
    operatorAClient,
    "publish_project_canonical_snapshot",
    snapshotParams({
      projectId: projectA,
      publisherInstanceId: instanceA,
      revision: 2,
      payload: utf8Payload,
      payloadHash: "utf8-boundary",
    }),
    "payload_too_large",
  );
  record("UTF-8 multibyte payload boundary enforced", utf8Attempt.ok, { code: utf8Attempt.code });

  // Display sync matrix
  const displayId = randomUUID();
  const managerInsert = await managerAClient.from("displays").insert(
    makeHostedDisplayRow({
      id: displayId,
      projectId: projectA,
      name: `Live Display ${suffix}`,
      slug: `live-display-${suffix}`,
      instanceId: instanceA,
    }),
  );
  record("manager creates display", !managerInsert.error, { code: managerInsert.error?.code });

  const operatorInsert = await operatorAClient.from("displays").insert(
    makeHostedDisplayRow({
      id: randomUUID(),
      projectId: projectA,
      name: `Operator Display ${suffix}`,
      slug: `operator-display-${suffix}`,
      instanceId: instanceA,
    }),
  );
  record("operator creates display", !operatorInsert.error, { code: operatorInsert.error?.code });

  const viewerInsert = await viewerAClient.from("displays").insert(
    makeHostedDisplayRow({
      id: randomUUID(),
      projectId: projectA,
      name: "Viewer Display",
      slug: `viewer-display-${suffix}`,
      instanceId: instanceA,
    }),
  );
  record("viewer display insert denied", Boolean(viewerInsert.error));

  const outsiderRead = await outsiderClient.from("displays").select("id").eq("project_id", projectA);
  record("non-member display read denied", (outsiderRead.data?.length ?? 0) === 0);

  const crossProjectRead = await managerAClient.from("displays").select("id").eq("project_id", projectB);
  record("project A member denied project B displays", (crossProjectRead.data?.length ?? 0) === 0);

  const viewerRead = await viewerAClient.from("displays").select("id").eq("project_id", projectA);
  record("viewer can read project displays", (viewerRead.data?.length ?? 0) > 0);

  const immutableProject = await managerAClient
    .from("displays")
    .update({ project_id: projectB })
    .eq("id", displayId);
  record("display project_id immutable", Boolean(immutableProject.error));

  // Activity sync matrix
  const eventId = randomUUID();
  const allowedEvent = await expectRpc(operatorAClient, "upsert_activity_events_for_sync", {
    p_events: [
      makeActivityEvent({
        id: eventId,
        projectId: projectA,
        eventType: "display.updated",
        description: "Updated display during live validation",
        instanceId: instanceA,
        metadata: { display_id: displayId },
      }),
    ],
  }, "upserted");
  record("allowlisted activity event accepted", allowedEvent.ok, { code: allowedEvent.code });

  const duplicateEvent = await expectRpc(operatorAClient, "upsert_activity_events_for_sync", {
    p_events: [
      makeActivityEvent({
        id: eventId,
        projectId: projectA,
        eventType: "display.updated",
        description: "Duplicate event",
        instanceId: instanceA,
      }),
    ],
  }, "upserted");
  record("duplicate activity event idempotent", duplicateEvent.ok, { code: duplicateEvent.code });

  const badType = await expectRpc(operatorAClient, "upsert_activity_events_for_sync", {
    p_events: [
      makeActivityEvent({
        id: randomUUID(),
        projectId: projectA,
        eventType: "secret.admin-action",
        description: "Unauthorized type",
        instanceId: instanceA,
      }),
    ],
  }, "forbidden");
  record("unauthorized activity event type rejected", badType.ok, { code: badType.code });

  const crossProjectEvent = await expectRpc(operatorAClient, "upsert_activity_events_for_sync", {
    p_events: [
      makeActivityEvent({
        id: randomUUID(),
        projectId: projectB,
        eventType: "display.updated",
        description: "Cross project",
        instanceId: instanceA,
      }),
    ],
  }, "forbidden");
  record("cross-project activity event denied", crossProjectEvent.ok, { code: crossProjectEvent.code });

  const forgedActorId = randomUUID();
  const forgedActor = await expectRpc(operatorAClient, "upsert_activity_events_for_sync", {
    p_events: [
      makeActivityEvent({
        id: forgedActorId,
        projectId: projectA,
        eventType: "display.updated",
        description: "Forged actor",
        instanceId: instanceA,
        userId: ownerId,
      }),
    ],
  }, "upserted");
  record("forged actor event accepted by RPC", forgedActor.ok, { code: forgedActor.code });

  const storedActor = await admin
    .from("activity_events")
    .select("user_id")
    .eq("id", forgedActorId)
    .maybeSingle();
  record(
    "activity actor forced to auth.uid()",
    forgedActor.ok && storedActor.data?.user_id === operatorAId,
    { storedUserId: storedActor.data?.user_id, expectedUserId: operatorAId },
  );

  const credentialPayload = await expectRpc(operatorAClient, "upsert_activity_events_for_sync", {
    p_events: [
      makeActivityEvent({
        id: randomUUID(),
        projectId: projectA,
        eventType: "system.info",
        description: "Credential-shaped metadata",
        instanceId: instanceA,
        metadata: { password: "secret", token: "abc" },
      }),
    ],
  }, "upserted");
  record("credential-shaped activity metadata accepted with sanitization contract", credentialPayload.ok, {
    code: credentialPayload.code,
    note: "Desktop contract sanitizes at source; RPC stores metadata as provided for bounded payloads.",
  });

  // Directory matrix
  const ownerDirectory = await ownerClient.rpc("get_authorized_users_directory");
  record("platform owner directory RPC succeeds", !ownerDirectory.error, {
    fields: ownerDirectory.data?.[0] ? Object.keys(ownerDirectory.data[0]) : [],
  });

  const managerDirectory = await managerAClient.rpc("get_accessible_project_users_directory");
  const managerProjectRows = (managerDirectory.data ?? []).filter(
    (row) => row.project_id === projectA,
  );
  record("project manager directory RPC succeeds", !managerDirectory.error && managerProjectRows.length > 0, {
    fields: managerProjectRows[0] ? Object.keys(managerProjectRows[0]) : [],
    projectRowCount: managerProjectRows.length,
  });

  const outsiderDirectory = await outsiderClient.rpc("get_accessible_project_users_directory");
  record(
    "non-member project directory denied or empty",
    outsiderDirectory.error !== null || (outsiderDirectory.data?.length ?? 0) === 0,
  );

  const anonDirectory = await anon.rpc("get_authorized_users_directory");
  record(
    "anonymous directory denied or empty",
    anonDirectory.error !== null || (anonDirectory.data?.length ?? 0) === 0,
  );

  const crossDirectory = await managerAClient.rpc("get_accessible_project_users_directory");
  const crossProjectRows = (crossDirectory.data ?? []).filter(
    (row) => row.project_id === projectB,
  );
  record(
    "project A manager denied project B directory",
    crossDirectory.error !== null || crossProjectRows.length === 0,
    { projectBRowCount: crossProjectRows.length },
  );

  const outputPath = path.join(repoRoot, "docs", "slice-2.3-live-matrix-results.json");
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        projectRef: new URL(url).hostname.split(".")[0],
        testUsers: {
          ownerId,
          adminId,
          managerAId,
          operatorAId,
          viewerAId,
          outsiderId,
          managerBId,
        },
        projects: { projectA, projectB },
        results,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`\nWrote live matrix results to ${outputPath}`);

  if (results.some((entry) => !entry.ok)) {
    process.exitCode = 1;
  }
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
          `Access fixture cleanup: projects=${cleanupResult.counts?.projects ?? 0}, users=${cleanupResult.counts?.users ?? 0}, teams=${cleanupResult.counts?.teams ?? 0}, invitations=${cleanupResult.counts?.invitations ?? 0}`,
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
