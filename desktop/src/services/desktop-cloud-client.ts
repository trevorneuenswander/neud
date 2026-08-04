import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";

export async function upsertDesktopHost(
  cloud: AuthenticatedCloudCoordinator,
  host: {
    id: string;
    displayName: string;
    hostname: string;
    platform: string;
    appVersion: string;
  },
): Promise<void> {
  const client = await cloud.getClient();
  if (!client) {
    return;
  }

  const { data, error } = await client.rpc("upsert_desktop_host_for_client", {
    p_host_id: host.id,
    p_display_name: host.displayName,
    p_hostname: host.hostname,
    p_platform: host.platform,
    p_app_version: host.appVersion,
  });

  if (error) {
    console.warn("[desktop-host] Unable to upsert host:", error.message);
    return;
  }

  if (data && typeof data === "object" && "ok" in data && data.ok !== true) {
    console.warn("[desktop-host] Host registration rejected:", data);
  }
}

export async function getAuthenticatedSupabaseClient(
  cloud: AuthenticatedCloudCoordinator,
): Promise<SupabaseClient | null> {
  return cloud.getClient();
}
