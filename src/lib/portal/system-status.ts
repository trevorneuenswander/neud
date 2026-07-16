import { createClient } from "@/lib/supabase/server";

import { verifyProjectsConnected } from "@/lib/projects/queries";

export type SystemStatusItem = {
  label: string;
  value: string;
  state: "connected" | "unavailable" | "not-configured";
};

export async function getSystemStatus(
  isAuthenticated: boolean,
): Promise<SystemStatusItem[]> {
  let databaseConnected = false;
  let projectsConnected = false;

  if (isAuthenticated) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("profiles").select("id").limit(1);
      databaseConnected = !error;

      projectsConnected = await verifyProjectsConnected();
    } catch {
      databaseConnected = false;
      projectsConnected = false;
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
      value: projectsConnected ? "Connected" : "Unavailable",
      state: projectsConnected ? "connected" : "unavailable",
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
