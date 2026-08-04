"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagLiveStateEvents = void 0;
const events_1 = require("events");
class BagLiveStateEvents extends events_1.EventEmitter {
    publishUpdate(envelope) {
        const event = {
            type: "bag.live-state.updated",
            projectId: envelope.state.projectId,
            state: envelope.state,
            automaticState: envelope.automaticState,
            automaticComparison: envelope.automaticComparison,
            manualSession: envelope.manualSession,
            latestScrapedCurrentLot: envelope.latestScrapedCurrentLot,
            localControllerDraft: envelope.localControllerDraft,
            localControllerSubmitted: envelope.localControllerSubmitted,
            manualLotNavigation: envelope.manualLotNavigation,
            manualLotNavigationCapabilities: envelope.manualLotNavigationCapabilities,
        };
        this.emit("update", event);
        this.emit(`update:${envelope.state.projectId}`, event);
    }
    subscribe(projectId, listener) {
        const channel = `update:${projectId}`;
        this.on(channel, listener);
        return () => {
            this.off(channel, listener);
        };
    }
    closeProject(projectId) {
        this.emit(`close:${projectId}`);
        this.removeAllListeners(`update:${projectId}`);
    }
}
exports.BagLiveStateEvents = BagLiveStateEvents;
