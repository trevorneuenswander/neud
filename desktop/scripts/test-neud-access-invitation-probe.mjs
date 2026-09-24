#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  deriveDiagnosticInvitationFailureStage,
  parseAccessInvitationProbeBody,
  unwrapAccessInvitationProbePayload,
} from "../../scripts/live-validation/lib/access-invitation-probe.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("shared auth available with token does not classify as desktop_shared_auth_unavailable", () => {
  const stage = deriveDiagnosticInvitationFailureStage({
    sharedCloudAuthAvailable: true,
    accessTokenPresent: true,
    accessTokenExpired: false,
    probe: parseAccessInvitationProbeBody({}, { httpStatus: 200 }),
    persistedStage: "desktop_shared_auth_unavailable",
  });
  assert.notEqual(stage, "desktop_shared_auth_unavailable");
  assert.equal(stage, "probe_response_invalid");
});

test("unwrap nested probe and data envelopes", () => {
  const nested = unwrapAccessInvitationProbePayload({
    ok: true,
    data: {
      probe: { trustedAccessCallerResolved: true, firstInvitationFailureStage: "none" },
    },
  });
  assert.equal(nested.trustedAccessCallerResolved, true);
});

test("owner probe shape parses at top level", () => {
  const parsed = parseAccessInvitationProbeBody(
    {
      ok: true,
      trustedAccessCallerResolved: true,
      trustedAccessAuthSource: "bearer",
      callerUserIdPresent: true,
      callerIsSoleOwner: true,
      callerHasSiteWideAccess: true,
      invitationServiceConfigured: true,
      createInvitationRpcAvailable: true,
      authAdminInviteCapabilityAvailable: true,
      firstInvitationFailureStage: "none",
    },
    { httpStatus: 200 },
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.firstInvitationFailureStage, "none");
});

test("http 200 without probe fields is probe_response_invalid", () => {
  const parsed = parseAccessInvitationProbeBody({ ok: true }, { httpStatus: 200 });
  assert.equal(parsed.firstInvitationFailureStage, "probe_response_invalid");
  assert.equal(parsed.trustedAccessCallerResolved, false);
});

test("local API ok uses caller resolved not http status alone", () => {
  const local = read("desktop/src/services/local-data-service.ts");
  assert.match(local, /ok: probe\.trustedAccessCallerResolved === true/);
});

test("probe and mutation share getCloudAccessToken", () => {
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  assert.match(client, /probeTrustedAccessAuth[\s\S]*getAccessToken/);
  assert.match(client, /createInvitation[\s\S]*this\.request/);
  assert.match(client, /getCloudAccessToken/);
});

test("hosted probe uses resolveTrustedAccessCaller and route marker", () => {
  const probe = read("src/app/api/access/invitations/probe/route.ts");
  const session = read("src/lib/auth/hosted-route-session.ts");
  const routes = read("shared/access-management/trusted-access-routes.ts");
  assert.match(probe, /resolveTrustedAccessCallerWithAuthDiagnostics/);
  assert.match(probe, /ACCESS_INVITATIONS_PROBE_ROUTE_MARKER/);
  assert.match(routes, /ACCESS_INVITATION_PROBE_ROUTE/);
  assert.match(session, /auth\.getUser\(bearerToken\)/);
});

test("probe and mutation use explicit route constants", () => {
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  const routes = read("desktop/src/services/trusted-access-routes.ts");
  assert.match(routes, /ACCESS_INVITATION_PROBE_ROUTE = "\/api\/access\/invitations\/probe"/);
  assert.match(routes, /ACCESS_INVITATION_CREATE_ROUTE = "\/api\/access\/invitations"/);
  assert.match(client, /ACCESS_INVITATION_PROBE_ROUTE/);
  assert.match(client, /ACCESS_INVITATION_CREATE_ROUTE/);
  assert.match(client, /requireRouteMarker: true/);
});

test("POST invitations route uses same caller resolver and auth diagnostics", () => {
  const post = read("src/app/api/access/invitations/route.ts");
  assert.match(post, /resolveTrustedAccessCallerWithAuthDiagnostics/);
  assert.match(post, /postGetUserAttempted/);
  assert.match(post, /ACCESS_INVITATIONS_CREATE_ROUTE_MARKER/);
});

test("parser rejects mutation route marker as probe response", () => {
  const parsed = parseAccessInvitationProbeBody(
    { ok: false, code: "authentication_required", route: "access_invitations" },
    { httpStatus: 401, requireRouteMarker: true },
  );
  assert.equal(parsed.firstInvitationFailureStage, "probe_route_mismatch");
});

test("diagnose script uses shared probe parser", () => {
  const diagnose = read("scripts/live-validation/diagnose-access-invitation.mjs");
  assert.match(diagnose, /parseAccessInvitationProbeBody/);
  assert.match(diagnose, /deriveDiagnosticInvitationFailureStage/);
  assert.doesNotMatch(diagnose, /probePayload\.ok === true/);
});

test("missing service config does not force caller unresolved in parser", () => {
  const parsed = parseAccessInvitationProbeBody(
    {
      trustedAccessCallerResolved: true,
      trustedAccessAuthSource: "bearer",
      callerUserIdPresent: true,
      callerIsSoleOwner: true,
      callerHasSiteWideAccess: true,
      invitationServiceConfigured: false,
      createInvitationRpcAvailable: true,
      authAdminInviteCapabilityAvailable: false,
      firstInvitationFailureStage: "none",
    },
    { httpStatus: 200 },
  );
  assert.equal(parsed.trustedAccessCallerResolved, true);
});

test("expired token maps to stale stage in diagnostic classifier", () => {
  const stage = deriveDiagnosticInvitationFailureStage({
    sharedCloudAuthAvailable: true,
    accessTokenPresent: true,
    accessTokenExpired: true,
    probe: null,
  });
  assert.equal(stage, "stale_access_token_attached");
});
