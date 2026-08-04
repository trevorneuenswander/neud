import { getCommandStaleAfterMs } from "./config.js";
import { sanitizeError } from "./errors.js";
import { isLocalApiEnabled } from "./local-client.js";
import * as localClient from "./local-client.js";
import { getSupabase } from "./cloud-client.js";

export async function claimNextCommand(engineId, workerId) {
  if (isLocalApiEnabled()) {
    return localClient.claimNextCommand(engineId, workerId);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("claim_data_engine_command", {
    p_engine_id: engineId,
    p_worker_id: workerId,
  });

  if (error) throw error;
  if (!data?.length) return null;

  return data[0];
}

export async function completeCommand(commandId) {
  if (isLocalApiEnabled()) {
    return localClient.finalizeCommandSuccess(commandId);
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("data_engine_commands")
    .update({
      status: "completed",
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", commandId);

  if (error) {
    throw error;
  }
}

export async function failCommand(commandId, errorMessage) {
  if (isLocalApiEnabled()) {
    return localClient.finalizeCommandFailure(commandId, errorMessage);
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("data_engine_commands")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", commandId);

  if (error) {
    throw error;
  }
}

export async function failAbandonedCommands(
  engineId,
  workerId,
  staleAfterMs = getCommandStaleAfterMs(),
) {
  if (isLocalApiEnabled()) {
    return localClient.failAbandonedCommands(engineId, workerId, staleAfterMs);
  }

  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();

  const { data: staleRows, error: selectError } = await supabase
    .from("data_engine_commands")
    .select("id, claimed_by_worker_id")
    .eq("engine_id", engineId)
    .eq("status", "processing")
    .lt("processing_started_at", cutoff);

  if (selectError || !staleRows?.length) {
    return 0;
  }

  const idsToFail = staleRows
    .filter(
      (row) =>
        !row.claimed_by_worker_id || row.claimed_by_worker_id === workerId,
    )
    .map((row) => row.id);

  if (!idsToFail.length) {
    return 0;
  }

  const { error: updateError } = await supabase
    .from("data_engine_commands")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      error_message: "Worker restarted before the command completed.",
    })
    .in("id", idsToFail);

  if (updateError) {
    console.error(
      "[commands] Unable to fail abandoned commands:",
      sanitizeError(updateError),
    );
    return 0;
  }

  return idsToFail.length;
}

export async function finalizeCommandSuccess(commandId) {
  try {
    await completeCommand(commandId);
  } catch (error) {
    console.error(
      `[commands] Unable to mark command ${commandId} completed:`,
      sanitizeError(error),
    );
  }
}

export async function finalizeCommandFailure(commandId, error) {
  const message = sanitizeError(error);

  try {
    await failCommand(commandId, message);
  } catch (failError) {
    console.error(
      `[commands] Unable to mark command ${commandId} failed:`,
      sanitizeError(failError),
    );
  }

  return message;
}
