import { randomUUID } from "crypto";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";

export const NEUD_INSTANCE_ID_SETTING_KEY = "neud.instanceId";

export function getOrCreateNeudInstanceId(settings: AppSettingsRepository): string {
  const existing = settings.get<string | null>(NEUD_INSTANCE_ID_SETTING_KEY, null);
  if (typeof existing === "string" && existing.trim()) {
    return existing.trim();
  }

  const instanceId = randomUUID();
  settings.set(NEUD_INSTANCE_ID_SETTING_KEY, instanceId);
  return instanceId;
}
