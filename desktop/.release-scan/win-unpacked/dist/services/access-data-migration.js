"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAccessDataMigration = runAccessDataMigration;
const default_owner_email_1 = require("../auth/default-owner-email");
const ACCESS_DATA_MIGRATION_KEY = "access_data_migration_v1";
function runAccessDataMigration(input) {
    const alreadyApplied = input.db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(ACCESS_DATA_MIGRATION_KEY);
    if (alreadyApplied) {
        try {
            const parsed = JSON.parse(alreadyApplied.value_json);
            if (parsed === "done") {
                return;
            }
        }
        catch {
            // Fall through and attempt migration if the marker is unreadable.
        }
    }
    input.db.transaction(() => {
        migrateAccessData(input);
        input.db
            .prepare(`INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`)
            .run(ACCESS_DATA_MIGRATION_KEY, JSON.stringify("done"));
    });
}
function migrateAccessData(input) {
    const authUser = input.auth.getAuthenticatedUser();
    const authStatus = input.auth.getStatus();
    let ownerUser = (authUser?.userId ? input.users.getById(authUser.userId) : null) ??
        (authUser?.email ? input.users.getByEmail(authUser.email) : null);
    const legacyRole = authUser?.role ?? authStatus.role ?? "user";
    const isOwner = legacyRole === "owner";
    if (!ownerUser && authUser) {
        ownerUser = input.users.upsert({
            id: authUser.userId,
            email: authUser.email,
            fullName: authUser.displayName || authUser.email.split("@")[0] || "Owner",
            platformRole: isOwner ? "owner" : "user",
            isActive: true,
        });
    }
    if (!ownerUser) {
        const existingOwners = input.users.listAll().filter((user) => user.platformRole === "owner");
        ownerUser = existingOwners[0] ?? null;
    }
    if (!ownerUser) {
        ownerUser = input.users.upsert({
            email: default_owner_email_1.DEFAULT_OWNER_EMAIL,
            fullName: "Owner",
            platformRole: "owner",
            isActive: true,
        });
    }
    let defaultTeam = input.teams.listAll()[0] ?? null;
    if (!defaultTeam) {
        defaultTeam = input.teams.create({
            name: "Hildreth Media Group",
            description: "Default team for Hildreth Media Group within NEUD.",
            createdByUserId: ownerUser.id,
        });
        console.info(`[access-migration] Created default team ${defaultTeam.name}`);
    }
    for (const project of input.projects.list()) {
        if (!project.teamId) {
            input.projects.setTeamId(project.id, defaultTeam.id);
        }
        if (!input.projectTeams.isAssigned(project.id, defaultTeam.id)) {
            input.projectTeams.assign({
                projectId: project.id,
                teamId: defaultTeam.id,
                createdByUserId: ownerUser.id,
            });
        }
    }
    const legacyRows = input.legacyMemberships.listAll();
    for (const row of legacyRows) {
        if (row.userId === ownerUser.id) {
            continue;
        }
        let user = input.users.getById(row.userId);
        if (!user) {
            user = input.users.upsert({
                id: row.userId,
                email: `${row.userId.slice(0, 8)}@legacy.neud.local`,
                fullName: "Legacy User",
                platformRole: "user",
                isActive: true,
            });
        }
        if (row.role === "admin" || row.role === "owner") {
            input.teamMemberships.upsert({
                teamId: defaultTeam.id,
                userId: user.id,
                role: "admin",
                createdByUserId: ownerUser.id,
            });
            continue;
        }
        if (row.role === "operator" || row.role === "viewer") {
            input.teamMemberships.upsert({
                teamId: defaultTeam.id,
                userId: user.id,
                role: row.role,
                createdByUserId: ownerUser.id,
            });
            input.projectMemberships.upsert({
                projectId: row.projectId,
                teamId: defaultTeam.id,
                userId: user.id,
                accessRole: row.role,
                createdByUserId: ownerUser.id,
            });
        }
    }
    console.info("[access-migration] Legacy access data migration completed.");
}
