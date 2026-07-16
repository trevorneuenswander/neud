import { createClient } from "@/lib/supabase/server";
import type { AccessRequest } from "@/types/database";

export async function getAccessRequests(): Promise<AccessRequest[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("access_requests")
    .select(
      "id, full_name, email, company, comments, status, reviewed_by, reviewed_at, created_at",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as AccessRequest[];
}

export async function getPendingAccessRequestCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error || count === null) {
    return 0;
  }

  return count;
}
