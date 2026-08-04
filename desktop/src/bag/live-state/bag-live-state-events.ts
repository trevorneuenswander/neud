import { EventEmitter } from "events";
import type {
  BagLiveStateEnvelope,
  BagLiveStateUpdatedEvent,
} from "./bag-live-state-types";

export class BagLiveStateEvents extends EventEmitter {
  publishUpdate(envelope: BagLiveStateEnvelope) {
    const event: BagLiveStateUpdatedEvent = {
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

  subscribe(projectId: string, listener: (event: BagLiveStateUpdatedEvent) => void) {
    const channel = `update:${projectId}`;
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }

  closeProject(projectId: string) {
    this.emit(`close:${projectId}`);
    this.removeAllListeners(`update:${projectId}`);
  }
}
