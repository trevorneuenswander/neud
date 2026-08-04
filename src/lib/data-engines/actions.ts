"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/authorization";
import {
  requireEngineConfigurationAccess,
  requireEngineControlAccess,
  requireEngineReadAccess,
  requireWebpageScraperEngine,
} from "@/lib/data-engines/authorization";
import { isCommandStale } from "@/lib/data-engines/command-utils";
import { COMMAND_STALE_AFTER_MS } from "@/lib/data-engines/constants";
import type { DataEngineActionState } from "@/lib/data-engines/state";
import {
  parseScraperSettingsForm,
  parseSourceForm,
  validateDetailsTtlMs,
  validateEngineCommand,
  validateMaxDetailChecks,
  validatePollIntervalMs,
  validateSourceKey,
  validateSourceName,
  validateSourceType,
  validateSourceUrl,
  isValidUuid,
} from "@/lib/data-engines/validation";
import { createClient } from "@/lib/supabase/server";
import { shouldUseLocalData } from "@/lib/local/mode";
import {
  localQueueRunOnce,
  localRemoveScraperSource,
  localSaveScraperSource,
  localSetExecutionMode,
  localToggleScraperSource,
  localUpdateDesiredState,
  localUpdateScraperSettings,
} from "@/lib/local/api";

function revalidateEnginePaths(projectSlug: string, engineId: string) {
  revalidatePath(`/projects/${projectSlug}/data-engines`);
  revalidatePath(`/projects/${projectSlug}/data-engines/${engineId}`);
}

function allowInsecureUrls() {
  return process.env.NODE_ENV !== "production";
}

export async function sendEngineCommand(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const commandInput = String(formData.get("command") ?? "").trim();
  const command = validateEngineCommand(commandInput);

  const access = await requireEngineControlAccess(projectSlug, engineId);

  if (!command) {
    return { error: "Invalid command.", success: null };
  }

  if (shouldUseLocalData()) {
    try {
      if (command === "start" || command === "restart") {
        await localUpdateDesiredState(access.engine.id, "running");
      } else if (command === "stop") {
        await localUpdateDesiredState(access.engine.id, "stopped");
      } else if (command === "run_once") {
        await localQueueRunOnce(access.engine.id);
      }
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unable to queue command locally.",
        success: null,
      };
    }

    revalidateEnginePaths(projectSlug, engineId);
    return {
      error: null,
      success: `${command.replace("_", " ")} command queued.`,
    };
  }

  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: pending } = await supabase
    .from("data_engine_commands")
    .select("id")
    .eq("engine_id", access.engine.id)
    .in("status", ["pending", "processing"])
    .limit(1);

  if (pending?.length) {
    return {
      error: "A command is already pending for this Data Engine.",
      success: null,
    };
  }

  if (command === "start" || command === "restart") {
    await supabase
      .from("data_engines")
      .update({ desired_state: "running" })
      .eq("id", access.engine.id);
  }

  if (command === "stop") {
    await supabase
      .from("data_engines")
      .update({ desired_state: "stopped" })
      .eq("id", access.engine.id);
  }

  const { error } = await supabase.from("data_engine_commands").insert({
    engine_id: access.engine.id,
    command,
    requested_by: profile.id,
  });

  if (error) {
    return { error: "Unable to queue command.", success: null };
  }

  revalidateEnginePaths(projectSlug, engineId);

  return {
    error: null,
    success: `${command.replace("_", " ")} command queued.`,
  };
}

export async function setEngineExecutionMode(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const modeInput = String(formData.get("executionMode") ?? "").trim();

  const access = await requireEngineControlAccess(projectSlug, engineId);
  const executionMode =
    modeInput === "local-desktop" ? "local-desktop" : "remote-worker";

  if (executionMode === "remote-worker") {
    return {
      error: "Remote Worker execution is not available yet. Desktop execution is required.",
      success: null,
    };
  }

  if (shouldUseLocalData()) {
    try {
      await localSetExecutionMode(access.engine.id, executionMode);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update execution mode locally.",
        success: null,
      };
    }

    revalidateEnginePaths(projectSlug, engineId);
    return {
      error: null,
      success:
        executionMode === "local-desktop"
          ? "This Data Engine will run locally on this PC."
          : "This Data Engine will use the remote worker queue.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("data_engines")
    .update({ execution_mode: executionMode })
    .eq("id", access.engine.id);

  if (error) {
    return { error: "Unable to update execution mode.", success: null };
  }

  revalidateEnginePaths(projectSlug, engineId);

  return {
    error: null,
    success:
      executionMode === "local-desktop"
        ? "This Data Engine will run locally on this PC."
        : "This Data Engine will use the remote worker queue.",
  };
}

export async function failStaleEngineCommand(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  await requireAdmin();

  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const commandIdRaw = String(formData.get("commandId") ?? "").trim();
  const commandId = Number.parseInt(commandIdRaw, 10);

  if (!Number.isInteger(commandId)) {
    return { error: "Invalid command.", success: null };
  }

  const access = await requireEngineReadAccess(projectSlug, engineId);
  const supabase = await createClient();

  const { data: command, error: readError } = await supabase
    .from("data_engine_commands")
    .select("*")
    .eq("id", commandId)
    .eq("engine_id", access.engine.id)
    .maybeSingle();

  if (readError || !command) {
    return { error: "Command not found.", success: null };
  }

  if (!isCommandStale(command)) {
    return {
      error: "Only stale processing commands can be marked failed.",
      success: null,
    };
  }

  const { data: failed, error } = await supabase.rpc(
    "fail_stale_data_engine_command",
    {
      p_command_id: commandId,
      p_stale_after_ms: COMMAND_STALE_AFTER_MS,
    },
  );

  if (error || !failed) {
    return { error: "Unable to mark the stale command failed.", success: null };
  }

  revalidateEnginePaths(projectSlug, engineId);

  return {
    error: null,
    success: "Stale command marked failed.",
  };
}

export async function updateScraperSettings(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const access = await requireEngineConfigurationAccess(projectSlug, engineId);
  await requireWebpageScraperEngine(projectSlug, engineId);

  const values = parseScraperSettingsForm(formData);
  const pollError = validatePollIntervalMs(values.pollIntervalMs);
  const ttlError = validateDetailsTtlMs(values.detailsTtlMs);
  const maxChecksError = validateMaxDetailChecks(values.maxDetailChecks);

  const validationError = pollError ?? ttlError ?? maxChecksError;
  if (validationError) {
    return { error: validationError, success: null };
  }

  if (shouldUseLocalData()) {
    try {
      await localUpdateScraperSettings(access.engine.id, {
        pollIntervalMs: values.pollIntervalMs,
        detailsTtlMs: values.detailsTtlMs,
        maxDetailChecksPerPoll: values.maxDetailChecks,
        headless: values.headless,
      });
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unable to update settings locally.",
        success: null,
      };
    }

    revalidateEnginePaths(projectSlug, engineId);
    return {
      error: null,
      success: "Settings updated. Changes apply on the next engine loop.",
    };
  }

  const { profile } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("webpage_scraper_settings")
    .update({
      poll_interval_ms: values.pollIntervalMs,
      details_ttl_ms: values.detailsTtlMs,
      max_detail_checks_per_poll: values.maxDetailChecks,
      headless: values.headless,
      updated_by: profile.id,
    })
    .eq("engine_id", access.engine.id);

  if (error) {
    return { error: "Unable to update settings.", success: null };
  }

  revalidateEnginePaths(projectSlug, engineId);
  return {
    error: null,
    success: "Settings updated. Changes apply on the next engine loop.",
  };
}

export async function saveScraperSource(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const access = await requireEngineConfigurationAccess(projectSlug, engineId);
  await requireWebpageScraperEngine(projectSlug, engineId);

  const values = parseSourceForm(formData);
  const nameError = validateSourceName(values.name);
  const keyError = validateSourceKey(values.sourceKey);
  const type = validateSourceType(values.sourceType);
  const urlError = validateSourceUrl(values.url, allowInsecureUrls());

  const validationError =
    nameError ??
    keyError ??
    (!type ? "Select a valid source type." : null) ??
    urlError;

  if (validationError) {
    return { error: validationError, success: null };
  }

  if (shouldUseLocalData()) {
    try {
      await localSaveScraperSource(access.engine.id, {
        id: sourceId || undefined,
        name: values.name.trim(),
        sourceKey: values.sourceKey.trim(),
        url: values.url.trim(),
        pageType: type as string,
        enabled: values.enabled,
        position: Number.isInteger(values.position) ? values.position : 0,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save source locally.";
      return {
        error: message.includes("duplicate")
          ? "That source key already exists for this Data Engine."
          : message,
        success: null,
      };
    }

    revalidateEnginePaths(projectSlug, engineId);
    return { error: null, success: "Source saved." };
  }

  const supabase = await createClient();
  const payload = {
    engine_id: access.engine.id,
    name: values.name.trim(),
    source_key: values.sourceKey.trim(),
    url: values.url.trim(),
    source_type: type,
    enabled: values.enabled,
    position: Number.isInteger(values.position) ? values.position : 0,
  };

  if (sourceId) {
    if (!isValidUuid(sourceId)) {
      return { error: "Invalid source.", success: null };
    }

    const { error } = await supabase
      .from("webpage_scraper_sources")
      .update(payload)
      .eq("id", sourceId)
      .eq("engine_id", access.engine.id);

    if (error) {
      return {
        error: error.message.includes("duplicate")
          ? "That source key already exists for this Data Engine."
          : "Unable to update source.",
        success: null,
      };
    }
  } else {
    const { error } = await supabase
      .from("webpage_scraper_sources")
      .insert(payload);

    if (error) {
      return {
        error: error.message.includes("duplicate")
          ? "That source key already exists for this Data Engine."
          : "Unable to add source.",
        success: null,
      };
    }
  }

  revalidateEnginePaths(projectSlug, engineId);
  return { error: null, success: "Source saved." };
}

export async function toggleScraperSource(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const enabled = formData.get("enabled") === "true";

  const access = await requireEngineConfigurationAccess(projectSlug, engineId);
  if (!isValidUuid(sourceId)) {
    return { error: "Invalid source.", success: null };
  }

  if (shouldUseLocalData()) {
    try {
      await localToggleScraperSource(access.engine.id, sourceId, enabled);
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unable to update source locally.",
        success: null,
      };
    }

    revalidateEnginePaths(projectSlug, engineId);
    return { error: null, success: enabled ? "Source enabled." : "Source disabled." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("webpage_scraper_sources")
    .update({ enabled })
    .eq("id", sourceId)
    .eq("engine_id", access.engine.id);

  if (error) {
    return { error: "Unable to update source.", success: null };
  }

  revalidateEnginePaths(projectSlug, engineId);
  return { error: null, success: enabled ? "Source enabled." : "Source disabled." };
}

export async function removeScraperSource(
  _prev: DataEngineActionState,
  formData: FormData,
): Promise<DataEngineActionState> {
  const projectSlug = String(formData.get("projectSlug") ?? "").trim();
  const engineId = String(formData.get("engineId") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const access = await requireEngineConfigurationAccess(projectSlug, engineId);

  if (!isValidUuid(sourceId)) {
    return { error: "Invalid source.", success: null };
  }

  if (shouldUseLocalData()) {
    try {
      await localRemoveScraperSource(access.engine.id, sourceId);
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unable to remove source locally.",
        success: null,
      };
    }

    revalidateEnginePaths(projectSlug, engineId);
    return { error: null, success: "Source removed." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("webpage_scraper_sources")
    .delete()
    .eq("id", sourceId)
    .eq("engine_id", access.engine.id);

  if (error) {
    return { error: "Unable to remove source.", success: null };
  }

  revalidateEnginePaths(projectSlug, engineId);
  return { error: null, success: "Source removed." };
}
