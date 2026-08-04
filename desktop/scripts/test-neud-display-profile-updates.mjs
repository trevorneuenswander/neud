import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("shared HTML runtime script exists with iframe and standalone support", () => {
  const runtime = read("public/neud-display-runtime.js");
  assert.match(runtime, /NEUD_DISPLAY_READY/);
  assert.match(runtime, /NEUD_DATA_UPDATE/);
  assert.match(runtime, /EventSource/);
  assert.match(runtime, /NEUDDisplay/);
  assert.match(runtime, /subscribe:\s*function/);
  assert.match(runtime, /broadArrowDisplay/);
});

test("standalone HTML wrapping uses external runtime script", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /neud-display-runtime\.js/);
  assert.match(templates, /buildDisplayConfigScript/);
  assert.match(templates, /__NEUD_DISPLAY_CONFIG__/);
});

test("bridge data includes shared broadArrowDisplay payload", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /broadArrowDisplay/);
  assert.match(service, /normalizeBroadArrowDisplayData/);
});

test("TypeScript display path remains separate from HTML iframe bridge", () => {
  const card = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  assert.match(card, /useBroadArrowDisplayData/);
  assert.doesNotMatch(card, /DisplayPreviewPanel/);
});

test("profile page uses profile-table full_name without email guessing", () => {
  const page = read("src/app/(portal)/profile/page.tsx");
  const form = read("src/components/profile/ProfileForm.tsx");
  assert.match(page, /profile record/);
  assert.match(form, /Name not set/);
  assert.match(form, /full_name/);
  assert.doesNotMatch(form, /split\("@"/);
});

test("profiles migration adds email phone and renames company to team", () => {
  const migration = read("supabase/migrations/015_profile_contact_fields.sql");
  assert.match(migration, /add column if not exists email text/);
  assert.match(migration, /add column if not exists phone_number text/);
  assert.match(migration, /rename column company to team/);
  assert.match(migration, /handle_new_auth_user_profile/);
  assert.match(migration, /sync_profile_email_from_auth/);
  assert.match(migration, /get_assignable_users_for_project/);
  assert.match(migration, /p\.team/);
  assert.doesNotMatch(migration, /nullif\(btrim\([^)]*->>\s*'role',\s*''\)/);
  assert.match(
    migration,
    /nullif\(btrim\(new\.raw_user_meta_data ->> 'role'\),\s*''\)/,
  );
});

test("local desktop mode bypasses hosted supabase proxy redirects", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  const authorization = read("src/lib/auth/authorization.ts");
  assert.match(proxy, /shouldUseLocalData\(\)/);
  assert.match(authorization, /resolveLocalProfile/);
});
