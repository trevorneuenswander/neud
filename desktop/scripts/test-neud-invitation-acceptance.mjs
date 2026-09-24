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

test("cloud invitation email uses auth confirm redirect to accept-invitation", () => {
  const route = read("src/app/api/access/invitations/route.ts");
  const inviteEmail = read("src/lib/access-management/send-auth-admin-invite.ts");
  const redirect = read("src/lib/access-management/invitation-redirect.ts");
  assert.match(route, /sendAuthAdminInviteEmail/);
  assert.match(inviteEmail, /buildSupabaseInviteRedirectTo/);
  assert.match(inviteEmail, /redirectTo: inviteRedirect\.generatedInviteRedirectUrl/);
  assert.match(redirect, /ACCEPT_INVITATION_ROUTE_PATH = "\/accept-invitation"/);
  assert.match(redirect, /AUTH_CONFIRM_ROUTE_PATH = "\/auth\/confirm"/);
});

test("resend invitation uses same redirect builder", () => {
  const resend = read("src/app/api/access/invitations/[invitationId]/resend/route.ts");
  const inviteEmail = read("src/lib/access-management/send-auth-admin-invite.ts");
  assert.match(resend, /sendAuthAdminInviteEmail/);
  assert.match(inviteEmail, /buildSupabaseInviteRedirectTo/);
});

test("accept-invitation and auth confirm routes exist", () => {
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "src", "app", "(public)", "accept-invitation", "page.tsx"),
    ),
  );
  assert.ok(fs.existsSync(path.join(repoRoot, "src", "app", "auth", "confirm", "page.tsx")));
});

test("password acceptance finalizes accept_cloud_invitation RPC", () => {
  const actions = read("src/lib/auth/actions.ts");
  const finalize = read("src/lib/access-management/finalize-cloud-invitation-acceptance.ts");
  assert.match(actions, /finalizeCloudInvitationAcceptance/);
  assert.match(finalize, /accept_cloud_invitation/);
  assert.match(finalize, /invitation_token/);
  assert.match(actions, /redirect\("\/portal"\)/);
});

test("redirect resolver precedence includes trusted portal and vercel", () => {
  const redirect = read("src/lib/access-management/invitation-redirect.ts");
  assert.match(redirect, /NEUD_TRUSTED_PORTAL_ORIGIN/);
  assert.match(redirect, /VERCEL_URL/);
  assert.match(redirect, /localhost_dev_fallback/);
});

test("invitation acceptance error messages cover expired revoked and wrong email", () => {
  const finalize = read("src/lib/access-management/finalize-cloud-invitation-acceptance.ts");
  assert.match(finalize, /invitation_expired/);
  assert.match(finalize, /invitation_revoked/);
  assert.match(finalize, /different email address/);
  assert.match(finalize, /already been accepted/);
});

test("diagnose invitation acceptance script exists", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:invitation-acceptance/);
});
