"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSupabaseProfileRoleToPlatformRole = mapSupabaseProfileRoleToPlatformRole;
exports.mapSupabaseProfileRoleToAuthCacheRole = mapSupabaseProfileRoleToAuthCacheRole;
function mapSupabaseProfileRoleToPlatformRole(supabaseRole) {
    return supabaseRole?.trim().toLowerCase() === "owner" ? "owner" : "user";
}
function mapSupabaseProfileRoleToAuthCacheRole(supabaseRole) {
    return mapSupabaseProfileRoleToPlatformRole(supabaseRole) === "owner" ? "owner" : "user";
}
