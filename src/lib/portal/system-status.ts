import { createClient } from "@/lib/supabase/server";

export type SystemStatusItem = {
  label: string;
  value: string;
  state: "connected" | "unavailable" | "not-configured";
};

export async function getSystemStatus(
  isAuthenticated: boolean,
): Promise<SystemStatusItem[]> {
  let databaseConnected = false;

  if (isAuthenticated) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("profiles").select("id").limit(1);
      databaseConnected = !error;
    } catch {
      databaseConnected = false;
    }
  }

  return [
    {
      label: "Authentication",
      value: isAuthenticated ? "Connected" : "Unavailable",
      state: isAuthenticated ? "connected" : "unavailable",
    },
    {
      label: "Database",
      value: databaseConnected ? "Connected" : "Unavailable",
      state: databaseConnected ? "connected" : "unavailable",
    },
    {
      label: "Projects",
      value: "Not configured",
      state: "not-configured",
    },
    {
      label: "Workers",
      value: "Not configured",
      state: "not-configured",
    },
    {
      label: "Displays",
      value: "Not configured",
      state: "not-configured",
    },
  ];
}
