"use client";

import { createClient } from "@/lib/supabase/client";

export async function reorderHostedProjectDisplays(input: {
  projectId: string;
  displayIds: string[];
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reorder_project_displays", {
    p_project_id: input.projectId,
    p_display_ids: input.displayIds,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const result = (data ?? {}) as { ok?: boolean; message?: string; code?: string };
  if (!result.ok) {
    return {
      ok: false,
      message: result.message ?? result.code ?? "Unable to reorder displays.",
    };
  }

  return { ok: true };
}
