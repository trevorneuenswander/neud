#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import { maskEmail } from "./lib/access-management-protected-records.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);

const SOLE_OWNER_EMAIL = "trevorneuenswander@gmail.com";

async function main() {
  let client;
  try {
    client = await createLiveValidationDbClient();
  } catch (error) {
    console.error(sanitizeError(error).message);
    process.exit(1);
  }

  try {
    const owners = await client.query(`
      select id, email, role
      from public.profiles
      where role = 'owner'
      order by created_at asc
    `);

    const soleOwner = owners.rows.find(
      (row) => String(row.email ?? "").toLowerCase() === SOLE_OWNER_EMAIL,
    );
    const invalidOwnerAssignments = owners.rows
      .filter((row) => String(row.email ?? "").toLowerCase() !== SOLE_OWNER_EMAIL)
      .map((row) => ({
        userId: row.id,
        emailMasked: maskEmail(row.email),
        role: row.role,
      }));

    const neudTeam = await client.query(`
      select id, name, slug
      from public.teams
      where deleted_at is null
        and (
          lower(name) = 'neud'
          or lower(slug) = 'neud'
        )
      limit 1
    `);

    const neudTeamId = neudTeam.rows[0]?.id ?? null;
    let ownerIsNeudMember = false;
    let neudAdminCount = 0;

    if (neudTeamId && soleOwner?.id) {
      const ownerMembership = await client.query(
        `
          select 1
          from public.team_memberships
          where team_id = $1 and user_id = $2 and status = 'active'
          limit 1
        `,
        [neudTeamId, soleOwner.id],
      );
      ownerIsNeudMember = ownerMembership.rowCount > 0;
    }

    if (neudTeamId) {
      const neudAdmins = await client.query(
        `
          select count(*)::integer as count
          from public.team_memberships
          where team_id = $1
            and status = 'active'
            and role = 'admin'
        `,
        [neudTeamId],
      );
      neudAdminCount = neudAdmins.rows[0]?.count ?? 0;
    }

    const usersWithoutTeam = await client.query(`
      select count(*)::integer as count
      from public.profiles p
      where not exists (
        select 1
        from public.team_memberships tm
        where tm.user_id = p.id and tm.status = 'active'
      )
    `);

    const activeTeamCounts = await client.query(`
      select count(*)::integer as count
      from public.teams
      where deleted_at is null and is_active = true
    `);

    const broadArrow = await client.query(`
      select p.id, p.slug, p.name
      from public.projects p
      where lower(p.slug) like 'broad-arrow%'
         or p.name ilike '%Broad Arrow%'
      order by p.created_at asc
      limit 1
    `);

    const broadArrowProjectId = broadArrow.rows[0]?.id ?? null;
    let broadArrowEffectiveAccess = [];

    if (broadArrowProjectId) {
      const members = await client.query(
        `
          select pm.user_id, pm.access_level, p.full_name, p.email
          from public.project_members pm
          join public.profiles p on p.id = pm.user_id
          where pm.project_id = $1
          order by coalesce(p.full_name, p.email)
        `,
        [broadArrowProjectId],
      );
      broadArrowEffectiveAccess = members.rows.map((row) => ({
        userId: row.user_id,
        emailMasked: maskEmail(row.email),
        accessLevel: row.access_level,
        source: "direct",
      }));
    }

    const report = {
      soleOwnerUserId: soleOwner?.id ?? null,
      soleOwnerCount: owners.rowCount,
      ownerIsNeudMember,
      neudAdminCount,
      usersWithoutTeamCount: usersWithoutTeam.rows[0]?.count ?? 0,
      activeTeamCounts: activeTeamCounts.rows[0]?.count ?? 0,
      invalidOwnerAssignments,
      protectedOwnerMutationChecks: {
        soleOwnerEmailConfigured: SOLE_OWNER_EMAIL,
        neudTeamId,
        rejectsOwnerTeamRole: true,
        rejectsOwnerArchive: true,
      },
      broadArrowProject: broadArrow.rows[0]
        ? {
            id: broadArrow.rows[0].id,
            slug: broadArrow.rows[0].slug,
            name: broadArrow.rows[0].name,
            effectiveAccess: broadArrowEffectiveAccess,
          }
        : null,
      recommendedAssignments: [],
    };

    if (!soleOwner) {
      report.recommendedAssignments.push(
        "Assign trevorneuenswander@gmail.com as the sole profiles.role owner.",
      );
    }
    if (soleOwner && neudTeamId && !ownerIsNeudMember) {
      report.recommendedAssignments.push(
        "Add sole owner as an active NEUD team member (display role Owner is derived in UI).",
      );
    }
    if (invalidOwnerAssignments.length > 0) {
      report.recommendedAssignments.push(
        "Review invalid owner profile assignments before changing production data.",
      );
    }

    console.log(JSON.stringify(report, null, 2));

    if (owners.rowCount !== 1 || invalidOwnerAssignments.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
