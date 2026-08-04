/**
 * Single authoritative cloud session store for the desktop application.
 * All authenticated Supabase client state lives here; consumers use
 * AuthenticatedCloudCoordinator instead of accessing this directly.
 */
export { SupabaseUserSessionService as SharedCloudSessionService } from "./supabase-user-session";
