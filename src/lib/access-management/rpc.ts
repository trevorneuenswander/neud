import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAccessManagementError } from "./errors";

export type RpcResult = {
  ok: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
};

export async function invokeAccessRpc(
  supabase: SupabaseClient,
  rpcName: string,
  params: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    throw parseAccessManagementError(error.message, "forbidden");
  }

  if (!data || typeof data !== "object") {
    throw parseAccessManagementError("invalid_request", "invalid_request");
  }

  const payload = data as RpcResult;
  if (!payload.ok) {
    throw parseAccessManagementError(payload.code ?? "forbidden", "forbidden");
  }

  return payload;
}
