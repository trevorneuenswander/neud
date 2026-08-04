"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSupabaseProfileByUserId = fetchSupabaseProfileByUserId;
const supabase_profile_schema_1 = require("./supabase-profile-schema");
function mapProfileRow(row) {
    const team = row.team?.trim() || row.company?.trim() || null;
    return {
        id: row.id,
        full_name: row.full_name?.trim() || null,
        team,
        email: row.email?.trim() || null,
        phone_number: row.phone_number?.trim() || null,
        role: row.role?.trim() || null,
        updated_at: row.updated_at ?? null,
    };
}
async function fetchSupabaseProfileByUserId(supabase, userId) {
    const cachedColumn = (0, supabase_profile_schema_1.getCachedProfileTeamColumn)();
    if (cachedColumn === "company") {
        return fetchLegacyCompanyProfile(supabase, userId);
    }
    const modern = await supabase
        .from("profiles")
        .select("id, full_name, team, email, phone_number, role, updated_at")
        .eq("id", userId)
        .maybeSingle();
    if (!modern.error && modern.data) {
        (0, supabase_profile_schema_1.setCachedProfileTeamColumn)("team");
        return {
            status: "found",
            profile: mapProfileRow(modern.data),
        };
    }
    if (modern.error && (0, supabase_profile_schema_1.isMissingTeamColumnError)(modern.error.message)) {
        (0, supabase_profile_schema_1.setCachedProfileTeamColumn)("company");
        return fetchLegacyCompanyProfile(supabase, userId);
    }
    if (modern.error) {
        return { status: "error", error: modern.error.message };
    }
    if (cachedColumn === "team") {
        return { status: "missing", error: null };
    }
    const legacy = await fetchLegacyCompanyProfile(supabase, userId);
    if (legacy.status === "found") {
        (0, supabase_profile_schema_1.setCachedProfileTeamColumn)("company");
    }
    return legacy;
}
async function fetchLegacyCompanyProfile(supabase, userId) {
    const legacy = await supabase
        .from("profiles")
        .select("id, full_name, company, role, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();
    if (legacy.error) {
        return { status: "error", error: legacy.error.message };
    }
    if (!legacy.data) {
        return { status: "missing", error: null };
    }
    return {
        status: "found",
        profile: mapProfileRow(legacy.data),
    };
}
