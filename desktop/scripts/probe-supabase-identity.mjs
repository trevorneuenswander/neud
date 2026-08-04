#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const supabase = createClient(url, key, { auth: { persistSession: false } });
const userId = process.argv[2] ?? "323a2626-fd22-49ee-9abb-ebf6b72c8afa";

console.log("Configured Supabase project reference:", projectRef);

const profileMinimal = await supabase
  .from("profiles")
  .select("id, full_name, company, role, created_at, updated_at")
  .limit(10);

console.log("All profiles (minimal columns):", {
  error: profileMinimal.error?.message ?? null,
  rows: profileMinimal.data ?? [],
});

for (const authId of ["3bd404fe-7eff-45fe-9d52-296b5c953dc2", "d4f8b8e7-d91f-4006-88b2-70789fe0fda0"]) {
  const row = await supabase
    .from("profiles")
    .select("id, full_name, company, role")
    .eq("id", authId)
    .maybeSingle();
  console.log(`Profile for ${authId}:`, {
    error: row.error?.message ?? null,
    data: row.data,
  });
}

const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 20 });
console.log(
  "Auth users (first page):",
  (userList?.users ?? []).map((u) => ({ id: u.id, email: u.email })),
);

const brokenQuery = await supabase
  .from("profiles")
  .select("full_name, team, company, role")
  .eq("id", userId)
  .maybeSingle();

console.log("Profile query with company column:", {
  error: brokenQuery.error?.message ?? null,
  found: !!brokenQuery.data,
});

const members = await supabase
  .from("project_members")
  .select("project_id, access_level")
  .eq("user_id", userId);

console.log("Project memberships:", {
  error: members.error?.message ?? null,
  count: members.data?.length ?? 0,
});

const authUser = await supabase.auth.admin.getUserById(userId);
console.log("Auth user:", {
  error: authUser.error?.message ?? null,
  id: authUser.data?.user?.id ?? null,
  email: authUser.data?.user?.email ?? null,
});
