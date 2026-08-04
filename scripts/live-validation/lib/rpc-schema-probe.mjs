import { assertLiveValidationTarget } from "./env.mjs";

/**
 * Access/photo live matrix RPC specifications aligned with migrations 032–041.
 * Argument names follow pg_proc.proargnames for each function's input parameters.
 */
export const ACCESS_PHOTO_MATRIX_RPC_SPECS = [
  {
    name: "get_access_management_directory",
    required: true,
    expectedArgumentNames: ["p_include_fixtures"],
  },
  {
    name: "create_team",
    required: true,
    expectedArgumentNames: ["p_name", "p_description"],
  },
  {
    name: "update_team",
    required: true,
    expectedArgumentNames: ["p_team_id", "p_name", "p_description", "p_is_active"],
  },
  {
    name: "archive_team",
    required: true,
    expectedArgumentNames: ["p_team_id"],
  },
  {
    name: "upsert_team_member",
    required: true,
    expectedArgumentNames: ["p_team_id", "p_user_id", "p_role"],
  },
  {
    name: "remove_team_member",
    required: true,
    expectedArgumentNames: ["p_team_id", "p_user_id"],
  },
  {
    name: "assign_project_team",
    required: true,
    expectedArgumentNames: ["p_project_id", "p_team_id"],
  },
  {
    name: "remove_project_team",
    required: true,
    expectedArgumentNames: ["p_project_id", "p_team_id"],
  },
  {
    name: "upsert_project_member",
    required: true,
    expectedArgumentNames: ["p_project_id", "p_user_id", "p_role"],
  },
  {
    name: "remove_project_member",
    required: true,
    expectedArgumentNames: ["p_project_id", "p_user_id"],
  },
  {
    name: "create_cloud_invitation",
    required: true,
    expectedArgumentNames: [
      "p_email",
      "p_team_id",
      "p_team_role",
      "p_platform_role",
      "p_token_hash",
      "p_expires_at",
      "p_project_assignments",
    ],
  },
  {
    name: "resend_cloud_invitation",
    required: true,
    expectedArgumentNames: ["p_invitation_id", "p_token_hash", "p_expires_at"],
  },
  {
    name: "revoke_cloud_invitation",
    required: true,
    expectedArgumentNames: ["p_invitation_id"],
  },
  {
    name: "accept_cloud_invitation",
    required: true,
    expectedArgumentNames: ["p_token_hash"],
  },
  {
    name: "authorize_hosted_photo_asset",
    required: true,
    expectedArgumentNames: ["p_asset_id", "p_project_slug", "p_display_slug"],
  },
  {
    name: "register_project_photo_asset",
    required: true,
    expectedArgumentNames: [
      "p_project_id",
      "p_storage_path",
      "p_content_hash",
      "p_lot_key",
      "p_original_filename",
      "p_mime_type",
      "p_byte_size",
    ],
  },
];

export function parseIdentityArgumentNames(identityArguments) {
  if (!identityArguments) {
    return [];
  }

  return identityArguments
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export function inputArgumentNames(row) {
  if (Array.isArray(row.proargnames) && row.proargnames.length > 0) {
    return row.proargnames.slice(0, row.pronargs);
  }

  return parseIdentityArgumentNames(row.identity_arguments);
}

export function matchesExpectedArgumentNames(actualNames, expectedNames) {
  if (expectedNames.length === 0) {
    return actualNames.length === 0;
  }

  if (actualNames.length < expectedNames.length) {
    return false;
  }

  return expectedNames.every((name, index) => actualNames[index] === name);
}

export function matchRpcSpec(rows, spec) {
  const expectedNames = spec.expectedArgumentNames ?? [];

  if (!rows || rows.length === 0) {
    return {
      ok: false,
      code: "migration_missing",
      message: `Function public.${spec.name} was not found in pg_proc`,
    };
  }

  for (const row of rows) {
    const actualNames = inputArgumentNames(row);
    if (matchesExpectedArgumentNames(actualNames, expectedNames)) {
      return {
        ok: true,
        code: "ok",
        identityArguments: row.identity_arguments,
        argumentNames: actualNames,
      };
    }
  }

  return {
    ok: false,
    code: "signature_mismatch",
    message: `Function public.${spec.name} exists but no overload matched expected argument names`,
    expectedArgumentNames: expectedNames,
    foundOverloads: rows.map((row) => ({
      identityArguments: row.identity_arguments,
      argumentNames: inputArgumentNames(row),
    })),
  };
}

export async function queryPublicFunctionOverloads(client, functionName) {
  const { rows } = await client.query(
    `
      select
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) as identity_arguments,
        p.proargnames,
        p.pronargs,
        p.pronargdefaults
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = $1
        and p.prokind = 'f'
      order by p.oid
    `,
    [functionName],
  );

  return rows;
}

export async function verifyRpcSpec(client, spec) {
  try {
    const rows = await queryPublicFunctionOverloads(client, spec.name);
    return matchRpcSpec(rows, spec);
  } catch (error) {
    return {
      ok: false,
      code: "schema_probe_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyAccessPhotoMatrixRpcs(client, specs = ACCESS_PHOTO_MATRIX_RPC_SPECS) {
  const results = [];

  for (const spec of specs) {
    const probe = await verifyRpcSpec(client, spec);
    results.push({
      name: spec.name,
      required: spec.required !== false,
      ...probe,
    });
  }

  return results;
}

export async function createLiveValidationDbClient() {
  assertLiveValidationTarget();

  const dbUrl = process.env.NEUD_SUPABASE_DB_URL?.trim();
  if (!dbUrl) {
    throw new Error("Missing NEUD_SUPABASE_DB_URL");
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error("Install pg first: npm install --save-dev pg");
  }

  const client = new pg.default.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  return client;
}
