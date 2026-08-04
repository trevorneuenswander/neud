"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAuthenticatedSupabaseSession = verifyAuthenticatedSupabaseSession;
exports.probeSupabaseConnectivity = probeSupabaseConnectivity;
const fetch_supabase_profile_1 = require("./fetch-supabase-profile");
const resolve_authenticated_profile_1 = require("./resolve-authenticated-profile");
function isNetworkError(error) {
    if (!(error instanceof Error)) {
        return true;
    }
    const message = error.message.toLowerCase();
    return (message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("enotfound"));
}
async function verifyAuthenticatedSupabaseSession(input) {
    const authUser = input.auth.getAuthenticatedUser();
    if (!authUser) {
        return { status: "revoked", message: "No authenticated session." };
    }
    try {
        const { data, error } = await input.supabase.auth.getUser();
        if (error) {
            if (isNetworkError(error)) {
                return { status: "offline" };
            }
            return {
                status: "revoked",
                message: error.message || "Supabase rejected the current session.",
            };
        }
        const user = data.user;
        if (!user || user.id !== authUser.userId) {
            return {
                status: "revoked",
                message: "Supabase account no longer matches the local session.",
            };
        }
        if (user.banned_until && Date.parse(user.banned_until) > Date.now()) {
            return {
                status: "revoked",
                message: "Supabase account is disabled.",
            };
        }
        input.auth.refreshOnlineVerification();
        await syncAuthenticatedProfileFromSupabase(input);
        return { status: "valid" };
    }
    catch (error) {
        if (isNetworkError(error)) {
            return { status: "offline" };
        }
        return {
            status: "revoked",
            message: error instanceof Error ? error.message : "Unable to verify session.",
        };
    }
}
async function probeSupabaseConnectivity(supabase) {
    try {
        const { error } = await supabase.from("profiles").select("id").limit(1);
        return !error;
    }
    catch {
        return false;
    }
}
async function syncAuthenticatedProfileFromSupabase(input) {
    const authUser = input.auth.getAuthenticatedUser();
    if (!authUser) {
        return;
    }
    const profileResult = await (0, fetch_supabase_profile_1.fetchSupabaseProfileByUserId)(input.supabase, authUser.userId);
    if (profileResult.status === "error" || profileResult.status === "missing") {
        return;
    }
    if (profileResult.profile.id !== authUser.userId) {
        return;
    }
    input.auth.updateCachedProfile({
        displayName: (0, resolve_authenticated_profile_1.mergeOptionalProfileString)(authUser.displayName, profileResult.profile.full_name),
        team: (0, resolve_authenticated_profile_1.mergeOptionalProfileString)(authUser.team, profileResult.profile.team),
    });
}
