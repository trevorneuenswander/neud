import { createClient } from "@supabase/supabase-js";

export function createAnonClient(url, publishableKey) {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInClient(url, publishableKey, email, password) {
  const authClient = createAnonClient(url, publishableKey);
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "unknown"}`);
  }

  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    },
  });
}

export async function expectRpc(client, rpc, params, expectedCode) {
  const { data, error } = await client.rpc(rpc, params);
  if (error) {
    return {
      ok: expectedCode ? false : true,
      code: error.code ?? "rpc_error",
      message: error.message,
      data,
    };
  }

  const code = data?.code ?? (data?.ok === false ? data.code : "ok");
  return {
    ok: expectedCode ? code === expectedCode : data?.ok !== false,
    code,
    data,
  };
}

export async function createTestUser(admin, { email, password, role = "user", fullName }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? email.split("@")[0] },
  });
  if (error || !data.user?.id) {
    throw new Error(`Unable to create test user ${email}: ${error?.message ?? "unknown"}`);
  }

  await admin.from("profiles").upsert({
    id: data.user.id,
    full_name: fullName ?? email.split("@")[0],
    role,
  });

  return data.user.id;
}

export async function addProjectMember(admin, projectId, userId, accessLevel) {
  const { error } = await admin.from("project_members").upsert(
    {
      project_id: projectId,
      user_id: userId,
      access_level: accessLevel,
    },
    { onConflict: "project_id,user_id" },
  );
  if (error) {
    throw new Error(`Unable to add project member: ${error.message}`);
  }
}

export function makePassword(suffix) {
  return `NeudLive!${suffix}`;
}

export function makeEmail(prefix, suffix) {
  return `${prefix}-${suffix}@example.com`;
}
