#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";

const ACCEPT_ROUTE = "/accept-invitation";
const AUTH_CONFIRM = "/auth/confirm";

function acceptRouteExists(repoRoot) {
  return (
    fs.existsSync(
      path.join(repoRoot, "src", "app", "(public)", "accept-invitation", "page.tsx"),
    ) ||
    fs.existsSync(path.join(repoRoot, "src", "app", "accept-invitation", "page.tsx"))
  );
}

function authConfirmExists(repoRoot) {
  return fs.existsSync(path.join(repoRoot, "src", "app", "auth", "confirm", "page.tsx"));
}

function resolveRedirectOrigin(env) {
  const trusted = env.NEUD_TRUSTED_PORTAL_ORIGIN?.trim();
  if (trusted) {
    try {
      return { origin: new URL(trusted).origin.replace(/\/$/, ""), source: "NEUD_TRUSTED_PORTAL_ORIGIN" };
    } catch {
      /* continue */
    }
  }
  const vercel = env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return { origin: `https://${host}`, source: "VERCEL_URL" };
  }
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return { origin: new URL(site).origin.replace(/\/$/, ""), source: "NEXT_PUBLIC_SITE_URL" };
    } catch {
      /* continue */
    }
  }
  return { origin: "http://127.0.0.1:3000", source: "localhost_dev_fallback" };
}

function classifyOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") {
      return "localhost_dev";
    }
    if (host.includes("vercel.app")) {
      return "vercel_preview";
    }
    if (host === "neud.io" || host.endsWith(".neud.io")) {
      return "production";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

function deriveStage(input) {
  if (!input.authConfirmExists) {
    return "auth_callback_missing";
  }
  if (!input.acceptRouteExists) {
    return "route_missing";
  }
  if (!input.redirectPath.includes(AUTH_CONFIRM) || !input.redirectPath.includes("next=")) {
    return "redirect_path_wrong";
  }
  return "none";
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const acceptRoutePath = ACCEPT_ROUTE;
  const acceptExists = acceptRouteExists(repoRoot);
  const authConfirm = authConfirmExists(repoRoot);
  const { origin, source } = resolveRedirectOrigin(process.env);
  const generatedInviteRedirectPath = `${AUTH_CONFIRM}?next=${encodeURIComponent(ACCEPT_ROUTE)}`;
  const generatedInviteRedirectUrl = `${origin}${generatedInviteRedirectPath}`;
  const category = classifyOrigin(origin);

  const inviteEmailSource = fs.readFileSync(
    path.join(repoRoot, "src", "lib", "access-management", "send-auth-admin-invite.ts"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(repoRoot, "src", "lib", "auth", "actions.ts"),
    "utf8",
  );
  const panelSource = fs.readFileSync(
    path.join(repoRoot, "src", "components", "auth", "AcceptInvitationPanel.tsx"),
    "utf8",
  );
  const usesRedirectTo =
    inviteEmailSource.includes("redirectTo:") &&
    inviteEmailSource.includes("buildSupabaseInviteRedirectTo");
  const acceptFnStart = actionsSource.indexOf("export async function acceptInvitation");
  const acceptFnEnd = actionsSource.indexOf("\nexport async function ", acceptFnStart + 1);
  const acceptFnBody =
    acceptFnStart >= 0
      ? actionsSource.slice(acceptFnStart, acceptFnEnd >= 0 ? acceptFnEnd : undefined)
      : "";
  const profileUpdateBeforeAcceptRpc =
    acceptFnBody.includes("upsertInvitedUserProfile") &&
    acceptFnBody.indexOf("upsertInvitedUserProfile") <
      acceptFnBody.indexOf("finalizeCloudInvitationAcceptance");

  const rpcMigrationPresent = fs.existsSync(
    path.join(repoRoot, "supabase", "migrations", "045_access_role_model.sql"),
  );

  const firstInvitationAcceptFailureStage = deriveStage({
    acceptRouteExists: acceptExists,
    authConfirmExists: authConfirm,
    redirectPath: generatedInviteRedirectPath,
  });

  const summary = {
    acceptRoutePath,
    acceptRouteExists: acceptExists,
    authConfirmRouteExists: authConfirm,
    resolvedInvitationRedirectOrigin: origin,
    resolvedInvitationRedirectSource: source,
    generatedInviteRedirectPath,
    generatedInviteRedirectUrlCategory: category,
    generatedInviteRedirectUrlHost: new URL(generatedInviteRedirectUrl).host,
    inviteEmailUsesRedirectTo: usesRedirectTo,
    supabaseRedirectCandidateValid: null,
    invitationCallbackHandlerPresent: authConfirm,
    acceptInvitationRpcPresent: rpcMigrationPresent,
    acceptanceHandlerPresent: fs.existsSync(
      path.join(repoRoot, "src", "lib", "access-management", "finalize-cloud-invitation-acceptance.ts"),
    ),
    firstInvitationAcceptFailureStage: usesRedirectTo ? firstInvitationAcceptFailureStage : "redirect_path_wrong",
    acceptanceProfileFieldsRequired: true,
    existingProfilePresent: null,
    existingFullNamePresent: null,
    existingPhonePresent: null,
    profileUpdateAttempted: null,
    profileUpdateSucceeded: null,
    profileUpsertUsed: null,
    acceptInvitationRpcAttempted: null,
    acceptInvitationRpcSucceeded: null,
    firstInvitationProfileFailureStage: "none",
    acceptanceFormIncludesFirstName: panelSource.includes("firstName"),
    acceptanceFormIncludesLastName: panelSource.includes("lastName"),
    acceptanceFormIncludesPhoneNumber: panelSource.includes("phoneNumber"),
    profileUpdateBeforeAcceptRpc,
    profileSchemaUsesFullName: fs
      .readFileSync(path.join(repoRoot, "supabase/migrations/015_profile_contact_fields.sql"), "utf8")
      .includes("full_name"),
    profileSchemaUsesPhoneNumber: fs
      .readFileSync(path.join(repoRoot, "supabase/migrations/015_profile_contact_fields.sql"), "utf8")
      .includes("phone_number"),
    supabaseDashboardNote:
      "Ensure Supabase Auth redirect URLs allow: http://127.0.0.1:3000/auth/confirm, your Vercel Preview /auth/confirm, and https://neud.io/auth/confirm (manual dashboard change if missing).",
  };

  const outputPath = path.join(repoRoot, "docs", "invitation-acceptance-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
