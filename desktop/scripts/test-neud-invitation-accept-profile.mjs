#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildFullNameFromParts,
  validateInvitedProfileFirstName,
  validateInvitedProfileLastName,
  validateInvitedProfilePhone,
} from "../../scripts/live-validation/lib/invitation-acceptance-profile.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function acceptInvitationFunctionBody(actionsSource) {
  const start = actionsSource.indexOf("export async function acceptInvitation");
  assert.ok(start >= 0, "acceptInvitation not found");
  const nextExport = actionsSource.indexOf("\nexport async function ", start + 1);
  return nextExport >= 0 ? actionsSource.slice(start, nextExport) : actionsSource.slice(start);
}

test("accept form includes profile and password fields", () => {
  const panel = read("src/components/auth/AcceptInvitationPanel.tsx");
  assert.match(panel, /firstName/);
  assert.match(panel, /lastName/);
  assert.match(panel, /phoneNumber/);
  assert.match(panel, /confirmPassword/);
  assert.match(panel, /Accept Invitation/);
});

test("name fields required validation", () => {
  assert.equal(validateInvitedProfileFirstName("  "), "First name is required.");
  assert.equal(validateInvitedProfileLastName(""), "Last name is required.");
  assert.equal(validateInvitedProfileFirstName("Trevor"), null);
});

test("phone required and minimum digits", () => {
  assert.equal(validateInvitedProfilePhone(""), "Phone number is required.");
  assert.equal(validateInvitedProfilePhone("123"), "Enter a valid phone number.");
  assert.equal(validateInvitedProfilePhone("(555) 123-4567"), null);
});

test("full_name composed correctly", () => {
  assert.equal(buildFullNameFromParts("Trevor", "Neuenswander"), "Trevor Neuenswander");
  assert.equal(buildFullNameFromParts("  Trevor  ", "  Neuenswander "), "Trevor Neuenswander");
});

test("acceptance order: password then profile then rpc", () => {
  const body = acceptInvitationFunctionBody(read("src/lib/auth/actions.ts"));
  const passwordIndex = body.indexOf("await supabase.auth.updateUser({ password })");
  const profileIndex = body.indexOf("upsertInvitedUserProfile");
  const rpcIndex = body.indexOf("finalizeCloudInvitationAcceptance");
  assert.ok(passwordIndex >= 0 && profileIndex > passwordIndex && rpcIndex > profileIndex);
});

test("profile upsert uses authenticated user session", () => {
  const upsert = read("src/lib/access-management/upsert-invited-user-profile.ts");
  assert.match(upsert, /auth\.getUser\(\)/);
  assert.match(upsert, /\.eq\("id", userId\)/);
  assert.doesNotMatch(upsert, /createAdminClient/);
});

test("accept page prefills existing profile", () => {
  const page = read("src/app/(public)/accept-invitation/page.tsx");
  assert.match(page, /splitFullNameForPrefill/);
  assert.match(page, /phone_number/);
});

test("no email field on acceptance form", () => {
  const panel = read("src/components/auth/AcceptInvitationPanel.tsx");
  assert.doesNotMatch(panel, /name="email"/);
});

test("already accepted conflict redirects to portal", () => {
  const actions = read("src/lib/auth/actions.ts");
  assert.match(actions, /acceptance\.code === "conflict"/);
});

test("password still required via confirmation validation", () => {
  const actions = read("src/lib/auth/actions.ts");
  assert.match(actions, /validatePasswordConfirmation/);
});

test("profile update preserves unrelated fields on existing row", () => {
  const upsert = read("src/lib/access-management/upsert-invited-user-profile.ts");
  assert.match(upsert, /const patch = \{\s*full_name: fullName,\s*phone_number: phoneNumber,\s*\}/);
  assert.match(upsert, /\.update\(patch\)/);
});

test("missing profile row uses upsert path", () => {
  const upsert = read("src/lib/access-management/upsert-invited-user-profile.ts");
  assert.match(upsert, /\.upsert\(/);
  assert.match(upsert, /onConflict: "id"/);
});

test("profile failure prevents rpc finalize", () => {
  const body = acceptInvitationFunctionBody(read("src/lib/auth/actions.ts"));
  const profileFail = body.indexOf("if (!profileResult.ok)");
  const rpc = body.indexOf("finalizeCloudInvitationAcceptance");
  assert.ok(profileFail >= 0 && profileFail < rpc);
});

test("rpc failure returns error without redirect success", () => {
  const actions = read("src/lib/auth/actions.ts");
  assert.match(actions, /if \(!acceptance\.ok\)/);
  assert.match(actions, /return \{ error: acceptance\.userMessage/);
});

test("portal revalidated after successful acceptance", () => {
  const actions = read("src/lib/auth/actions.ts");
  assert.match(actions, /revalidatePath\("\/portal"\)/);
});

test("acceptance page copy", () => {
  const page = read("src/app/(public)/accept-invitation/page.tsx");
  assert.match(page, /Complete your NEUD account/);
  const panel = read("src/components/auth/AcceptInvitationPanel.tsx");
  assert.match(panel, /Accepting invitation/);
});
