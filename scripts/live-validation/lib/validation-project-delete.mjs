import { sanitizeError } from "./sanitize.mjs";

export const PROJECT_DEPENDENT_TABLES = [
  "project_team_assignments",
  "activity_events",
  "display_revisions",
  "displays",
  "display_deletion_tombstones",
  "project_publisher_leases",
  "project_canonical_snapshots",
  "project_publishing_settings",
  "cloud_project_registration_audit",
  "project_members",
  "project_photo_assets",
];

const OPTIONAL_PROJECT_TABLES = ["data_engines"];

export async function resetDbClientTransaction(dbClient) {
  await dbClient.query("rollback").catch(() => {});
}

export async function projectRowExists(dbClient, projectId) {
  await resetDbClientTransaction(dbClient);
  const { rowCount } = await dbClient.query(
    `select 1 from public.projects where id = $1 limit 1`,
    [projectId],
  );
  return rowCount > 0;
}

async function tableExists(dbClient, tableName) {
  const { rowCount } = await dbClient.query(
    `
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = $1
      limit 1
    `,
    [tableName],
  );
  return rowCount > 0;
}

export async function deleteValidationProjectViaPostgres(dbClient, projectId) {
  const tableResults = [];

  await resetDbClientTransaction(dbClient);
  await dbClient.query("begin");

  try {
    await dbClient.query("set local session_replication_role = replica");

    for (const table of PROJECT_DEPENDENT_TABLES) {
      const result = await dbClient.query(
        `delete from public.${table} where project_id = $1`,
        [projectId],
      );
      tableResults.push({ table, deletedRows: result.rowCount ?? 0, ok: true });
    }

    for (const table of OPTIONAL_PROJECT_TABLES) {
      if (!(await tableExists(dbClient, table))) {
        tableResults.push({ table, deletedRows: 0, ok: true, skipped: true });
        continue;
      }
      const result = await dbClient.query(
        `delete from public.${table} where project_id = $1`,
        [projectId],
      );
      tableResults.push({ table, deletedRows: result.rowCount ?? 0, ok: true });
    }

    const projectResult = await dbClient.query(`delete from public.projects where id = $1`, [
      projectId,
    ]);
    tableResults.push({
      table: "projects",
      deletedRows: projectResult.rowCount ?? 0,
      ok: projectResult.rowCount === 1,
    });

    await dbClient.query("set local session_replication_role = default");
    await dbClient.query("commit");
  } catch (error) {
    await resetDbClientTransaction(dbClient);
    throw error;
  }

  const stillExists = await projectRowExists(dbClient, projectId);
  return {
    ok: tableResults.some((entry) => entry.table === "projects" && entry.ok) && !stillExists,
    tableResults,
    stillExists,
  };
}

export async function deleteValidationProjectWithAudit(dbClient, project) {
  const entry = {
    id: project.id,
    slug: project.slug ?? null,
    name: project.name ?? null,
    table: "public.projects",
    deletionSuccess: false,
    stillExistsAfterDelete: null,
    tableResults: [],
    error: null,
  };

  try {
    const result = await deleteValidationProjectViaPostgres(dbClient, project.id);
    entry.tableResults = result.tableResults;
    entry.deletionSuccess = result.ok;
    entry.stillExistsAfterDelete = result.stillExists;
  } catch (error) {
    await resetDbClientTransaction(dbClient);
    entry.error = sanitizeError(error).message;
    entry.stillExistsAfterDelete = await projectRowExists(dbClient, project.id);
  }

  return entry;
}
