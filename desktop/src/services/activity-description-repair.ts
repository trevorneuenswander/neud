import type { ActivityEventsRepository } from "../repositories/activity-events-repository";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import { removeLeadingActorFromDescription } from "../lib/activity/description";
import { resolveActivityActorName } from "./activity-message";

const REPAIR_SETTING_KEY = "neud.activityDescriptionRepairCompleted";

export function repairHistoricalActivityDescriptions(input: {
  activityEvents: ActivityEventsRepository;
  settings: AppSettingsRepository;
}): { scanned: number; updated: number; unchanged: number } {
  if (input.settings.get<boolean>(REPAIR_SETTING_KEY, false)) {
    return { scanned: 0, updated: 0, unchanged: 0 };
  }

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;

  for (const event of input.activityEvents.listNewestFirst()) {
    scanned += 1;
    const actorName = resolveActivityActorName(event.actor);
    const cleaned = removeLeadingActorFromDescription(event.message, actorName || null);
    if (cleaned === event.message.trim()) {
      unchanged += 1;
      continue;
    }
    input.activityEvents.updateMessage(event.id, cleaned);
    updated += 1;
  }

  input.settings.set(REPAIR_SETTING_KEY, true);
  console.info(
    `[ActivityRepair] scanned=${scanned} updated=${updated} unchanged=${unchanged}`,
  );

  return { scanned, updated, unchanged };
}
