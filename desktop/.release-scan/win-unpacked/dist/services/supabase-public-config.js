"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSupabasePublicConfig = loadSupabasePublicConfig;
const fs_1 = __importDefault(require("fs"));
function loadSupabasePublicConfig(paths) {
    const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (fromEnv) {
        return {
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        };
    }
    if (!fs_1.default.existsSync(paths.serverEnvFile)) {
        return null;
    }
    const lines = fs_1.default.readFileSync(paths.serverEnvFile, "utf8").split(/\r?\n/);
    const values = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const index = trimmed.indexOf("=");
        if (index === -1)
            continue;
        values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    if (!values.NEXT_PUBLIC_SUPABASE_URL || !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        return null;
    }
    return {
        supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
        supabasePublishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };
}
