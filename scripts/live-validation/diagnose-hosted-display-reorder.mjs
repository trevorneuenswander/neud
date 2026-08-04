#!/usr/bin/env node
/**
 * Probe hosted display reorder prerequisites. Safe output only.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { isMigrationApplied, migrationChecksum, TRACKING_TABLE } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const MIGRATION_031 = "031_project_display_sort_order.sql";
const BROAD_ARROW_SLUG = "broad-arrow-auctions";

function readComponentSignals(repoRoot) {
  const client = fs.readFileSync(
    path.join(repoRoot, "src/components/hosted/HostedProjectDisplaysClient.tsx"),
    "utf8",
  );
  const handle = fs.readFileSync(
    path.join(repoRoot, "src/components/displays/DisplayDragHandle.tsx"),
    "utf8",
  );
  const queries = fs.readFileSync(
    path.join(repoRoot, "src/lib/hosted/portal-queries.ts"),
    "utf8",
  );
  const page = fs.readFileSync(
    path.join(repoRoot, "src/app/portal/projects/[slug]/displays/page.tsx"),
    "utf8",
  );
  const applyScript = fs.readFileSync(
    path.join(repoRoot, "scripts/live-validation/apply-migrations.mjs"),
    "utf8",
  );

  return {
    migrationInRunner: applyScript.includes(MIGRATION_031),
    usesHostedProjectDisplaysClient: page.includes("HostedProjectDisplaysClient"),
    canReorderFromSummary: page.includes("canReorder={summary.canReorder}"),
    canOperateRpcUsed: queries.includes("can_operate_project"),
    dndKitPresent: client.includes("DndContext") && client.includes("useSortable"),
    handleGatedByCanReorder: client.includes("{canReorder ?"),
    setActivatorNodeRef: client.includes("setActivatorNodeRef"),
    reorderRpcClient: fs.readFileSync(
      path.join(repoRoot, "src/lib/hosted/display-order-api.ts"),
      "utf8",
    ).includes("reorder_project_displays"),
    html5DraggableOnHandle: handle.includes("draggable={!disabled}"),
    desktopUsesHandle: fs.existsSync(
      path.join(repoRoot, "src/components/displays/DisplaysListClient.tsx"),
    )
      ? !fs
          .readFileSync(
            path.join(repoRoot, "src/components/displays/DisplaysListClient.tsx"),
            "utf8",
          )
          .includes("DisplayDragHandle")
      : null,
    localReorderUsesViewPermission: fs
      .readFileSync(
        path.join(repoRoot, "desktop/src/services/local-data-service.ts"),
        "utf8",
      )
      .includes("assertCanViewProject(userId, projectId)"),
  };
}

async function probeDatabase(dbUrl) {
  if (!dbUrl) {
    return {
      migration031Applied: null,
      sortOrderColumnPresent: null,
      rpcPresent: null,
      checksumMatchesLocalFile: null,
    };
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    return { migration031Applied: null, migrationProbeError: "pg unavailable" };
  }

  const client = new pg.default.Client({
    connectionString: dbUrl.trim(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const migration031Applied = await isMigrationApplied(client, MIGRATION_031);
    const localChecksum = migrationChecksum(
      fs.readFileSync(
        path.join(getRepoRoot(import.meta.url), "supabase/migrations", MIGRATION_031),
        "utf8",
      ),
    );
    const { rows: appliedRows } = await client.query(
      `select checksum from public.${TRACKING_TABLE} where migration_name = $1 limit 1`,
      [MIGRATION_031],
    );
    const appliedChecksum = appliedRows[0]?.checksum ?? null;

    const { rows: columnRows } = await client.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'displays' and column_name = 'sort_order'
    `);
    const { rows: rpcRows } = await client.query(`
      select proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'reorder_project_displays'
    `);

    return {
      migration031Applied,
      sortOrderColumnPresent: columnRows.length > 0,
      rpcPresent: rpcRows.length > 0,
      localFileChecksum: localChecksum,
      appliedChecksum,
      checksumMatchesLocalFile: appliedChecksum === localChecksum,
    };
  } finally {
    await client.end();
  }
}

async function probeCloudOrder(admin, projectId) {
  const { data } = await admin
    .from("displays")
    .select("id, slug, sort_order, is_archived, deleted_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("slug", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    sortOrder: row.sort_order,
  }));
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);
  const codeSignals = readComponentSignals(repoRoot);
  const dbUrl = process.env.NEUD_SUPABASE_DB_URL?.trim() ?? null;
  const dbProbe = await probeDatabase(dbUrl);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  let cloudOrderBefore = [];
  let activeDisplayIdsCount = null;
  let projectId = null;

  if (url && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("slug", BROAD_ARROW_SLUG)
      .maybeSingle();
    projectId = project?.id ?? null;
    if (projectId) {
      cloudOrderBefore = await probeCloudOrder(admin, projectId);
      activeDisplayIdsCount = cloudOrderBefore.length;
    }
  }

  let firstFailingStage = "unknown — requires interactive session";
  const failureCandidates = [];

  if (!codeSignals.migrationInRunner) {
    failureCandidates.push("migration_not_in_runner");
  }
  if (dbProbe.migration031Applied === false) {
    failureCandidates.push("migration_031_not_applied");
  }
  if (dbProbe.checksumMatchesLocalFile === false) {
    failureCandidates.push("migration_031_checksum_drift");
  }
  if (dbProbe.rpcPresent === false) {
    failureCandidates.push("reorder_rpc_missing");
  }
  if (codeSignals.html5DraggableOnHandle && codeSignals.setActivatorNodeRef) {
    failureCandidates.push("dnd_kit_html5_draggable_conflict_on_handle");
  }
  if (codeSignals.canOperateRpcUsed && codeSignals.handleGatedByCanReorder) {
    failureCandidates.push("viewer_role_canOperate_false_hides_handles");
  }
  if (codeSignals.localReorderUsesViewPermission) {
    failureCandidates.push("desktop_viewer_can_reorder_but_hosted_requires_operate");
  }

  if (failureCandidates.includes("viewer_role_canOperate_false_hides_handles")) {
    firstFailingStage =
      "authorization: can_operate_project=false for viewer — drag handles not rendered";
  } else if (failureCandidates.includes("dnd_kit_html5_draggable_conflict_on_handle")) {
    firstFailingStage =
      "client drag wiring: DisplayDragHandle draggable={true} conflicts with dnd-kit PointerSensor";
  } else if (failureCandidates.includes("migration_031_not_applied")) {
    firstFailingStage = "migration_031_not_applied_on_target_database";
  } else if (failureCandidates.includes("reorder_rpc_missing")) {
    firstFailingStage = "reorder_project_displays_rpc_missing";
  } else {
    firstFailingStage = "requires_runtime_session — check canReorder prop and drag events in browser";
  }

  const report = {
    generatedAt: new Date().toISOString(),
    migration031Applied: dbProbe.migration031Applied,
    migrationInApplyRunner: codeSignals.migrationInRunner,
    sortOrderColumnPresent: dbProbe.sortOrderColumnPresent,
    rpcPresent: dbProbe.rpcPresent,
    checksumMatchesLocalFile: dbProbe.checksumMatchesLocalFile,
    authenticatedSessionPresent: null,
    currentUserProjectRole: null,
    canOperateProject: null,
    serverCanReorder: null,
    dragHandleRendered: "conditional on canReorder prop",
    sortableItemCount: activeDisplayIdsCount,
    activeDisplayIdsCount,
    lastDragStartAt: null,
    lastDragEndAt: null,
    reorderRequestAttempted: null,
    reorderResult: null,
    safeErrorCode: null,
    cloudOrderBefore,
    cloudOrderAfter: null,
    localOrder: null,
    orderParity: null,
    codeSignals,
    authorizationSemantics: {
      hostedReorderGate: "can_operate_project → admin/manager/operator only",
      desktopReorderGate: "assertCanViewProject → any project member including viewer",
      viewerCanReorderHosted: false,
      viewerCanReorderDesktop: true,
    },
    rpcValidationNote:
      "reorder_project_displays requires every active (non-archived, non-deleted) display id exactly once — matches list_project_active_displays set",
    firstFailingStage,
    failureCandidates,
    recommendedCorrection: firstFailingStage.includes("authorization")
      ? "Confirm caller project_members.access_level is operator/manager or platform admin; or align hosted gate with product intent"
      : firstFailingStage.includes("dnd_kit")
        ? "Remove HTML5 draggable from DisplayDragHandle when used as dnd-kit activator, or attach dnd-kit listeners directly like DisplaysListClient"
        : firstFailingStage.includes("migration")
          ? "Apply migration 031 via npm run apply:live-migrations without editing applied checksum"
          : "Use browser devtools: verify canReorder, drag events, and reorder_project_displays RPC response",
    newMigrationRequired:
      dbProbe.migration031Applied === false ? "apply existing 031 only" : "no — 031 sufficient if applied",
    runtimeFieldsRequireBrowserSession: [
      "authenticatedSessionPresent",
      "canOperateProject",
      "serverCanReorder",
      "lastDragStartAt",
      "reorderRequestAttempted",
    ],
  };

  const outputPath = path.join(repoRoot, "docs", "hosted-display-reorder-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
