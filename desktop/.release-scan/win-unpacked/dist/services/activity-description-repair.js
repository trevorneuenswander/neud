"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairHistoricalActivityDescriptions = repairHistoricalActivityDescriptions;
const description_1 = require("../lib/activity/description");
const activity_message_1 = require("./activity-message");
const REPAIR_SETTING_KEY = "neud.activityDescriptionRepairCompleted";
function repairHistoricalActivityDescriptions(input) {
    if (input.settings.get(REPAIR_SETTING_KEY, false)) {
        return { scanned: 0, updated: 0, unchanged: 0 };
    }
    let scanned = 0;
    let updated = 0;
    let unchanged = 0;
    for (const event of input.activityEvents.listNewestFirst()) {
        scanned += 1;
        const actorName = (0, activity_message_1.resolveActivityActorName)(event.actor);
        const cleaned = (0, description_1.removeLeadingActorFromDescription)(event.message, actorName || null);
        if (cleaned === event.message.trim()) {
            unchanged += 1;
            continue;
        }
        input.activityEvents.updateMessage(event.id, cleaned);
        updated += 1;
    }
    input.settings.set(REPAIR_SETTING_KEY, true);
    console.info(`[ActivityRepair] scanned=${scanned} updated=${updated} unchanged=${unchanged}`);
    return { scanned, updated, unchanged };
}
