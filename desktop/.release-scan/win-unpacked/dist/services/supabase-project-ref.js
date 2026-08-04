"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSupabaseProjectRef = extractSupabaseProjectRef;
exports.logSupabaseProjectDiagnostics = logSupabaseProjectDiagnostics;
function extractSupabaseProjectRef(supabaseUrl) {
    try {
        const hostname = new URL(supabaseUrl).hostname;
        const ref = hostname.split(".")[0]?.trim();
        return ref || null;
    }
    catch {
        return null;
    }
}
function logSupabaseProjectDiagnostics(input) {
    if (process.env.NODE_ENV === "production") {
        return;
    }
    console.info(`[identity-resolution] Supabase auth project: ${input.authProjectRef ?? "unknown"} | profile project: ${input.profileProjectRef ?? "unknown"} | access project: ${input.accessProjectRef ?? "unknown"}`);
    const refs = [input.authProjectRef, input.profileProjectRef, input.accessProjectRef].filter(Boolean);
    const unique = new Set(refs);
    if (unique.size > 1) {
        console.warn("[identity-resolution] Supabase project reference mismatch detected.");
    }
}
