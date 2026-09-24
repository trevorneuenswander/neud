#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  classifyAuthAdminInviteFailure,
  mapInvitationEmailFailureToResponseCode,
} from "../../scripts/live-validation/lib/auth-admin-invite.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("local redirect URL shape for inviteUserByEmail", () => {
  const redirect = read("src/lib/access-management/invitation-redirect.ts");
  assert.match(redirect, /generatedInviteRedirectUrl/);
  assert.match(redirect, /generatedInviteRedirectPath = `\$\{AUTH_CONFIRM_ROUTE_PATH\}\?next=\$\{encodeURIComponent/);
});

test("create invitation uses sendAuthAdminInviteEmail helper", () => {
  const route = read("src/app/api/access/invitations/route.ts");
  assert.match(route, /sendAuthAdminInviteEmail/);
  assert.doesNotMatch(route, /inviteUserByEmail/);
});

test("redirect-not-allowed maps to redirect_not_allowed", () => {
  const result = classifyAuthAdminInviteFailure({
    message: "Redirect URL is not allowed",
    status: 400,
    name: "AuthApiError",
    code: "bad_request",
  });
  assert.equal(result.firstInvitationEmailFailureStage, "redirect_not_allowed");
  assert.equal(
    mapInvitationEmailFailureToResponseCode(result.firstInvitationEmailFailureStage),
    "invitation_redirect_not_allowed",
  );
});

test("existing user maps to user_already_exists", () => {
  const result = classifyAuthAdminInviteFailure({
    message: "User already registered",
    status: 422,
    name: "AuthApiError",
    code: "email_exists",
  });
  assert.equal(result.firstInvitationEmailFailureStage, "user_already_exists");
  assert.equal(result.targetUserAlreadyExists, true);
});

test("rate limit maps to email_rate_limited", () => {
  const result = classifyAuthAdminInviteFailure({
    message: "Too many requests",
    status: 429,
    name: "AuthApiError",
    code: "over_request_rate_limit",
  });
  assert.equal(result.firstInvitationEmailFailureStage, "email_rate_limited");
});

test("smtp failure maps separately", () => {
  const result = classifyAuthAdminInviteFailure({
    message: "Error sending invite email: SMTP configuration missing",
    status: 500,
    name: "AuthApiError",
    code: "unexpected_failure",
  });
  assert.equal(result.firstInvitationEmailFailureStage, "smtp_failure");
});

test("failed email revokes pending invitation on create route", () => {
  const send = read("src/lib/access-management/send-auth-admin-invite.ts");
  const route = read("src/app/api/access/invitations/route.ts");
  assert.match(send, /revoke_cloud_invitation/);
  assert.match(route, /invitationRevokedAfterFailure/);
});

test("resend does not revoke invitation on email failure", () => {
  const resend = read("src/app/api/access/invitations/[invitationId]/resend/route.ts");
  assert.match(resend, /revokeInvitationOnFailure: false/);
});

test("desktop persists auth admin invite diagnostics", () => {
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  assert.match(client, /firstInvitationEmailFailureStage/);
  assert.match(client, /authAdminInviteRedirectTo/);
});
