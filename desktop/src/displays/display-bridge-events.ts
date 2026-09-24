import { EventEmitter } from "events";

export type DisplayBridgeUpdatedEvent = {
  type: "neud-display-data-changed" | "neud-display-bridge.sync";
  projectId: string;
  revision: number;
  contentHash: string | null;
};

export class DisplayBridgeEvents extends EventEmitter {
  publishDisplayDataChanged(
    projectId: string,
    input: { revision: number; contentHash: string | null },
  ) {
    const event: DisplayBridgeUpdatedEvent = {
      type: "neud-display-data-changed",
      projectId,
      revision: input.revision,
      contentHash: input.contentHash,
    };
    this.emit("update", event);
    this.emit(`update:${projectId}`, event);
  }

  publishSync(projectId: string, input: { revision: number; contentHash: string | null }) {
    const event: DisplayBridgeUpdatedEvent = {
      type: "neud-display-bridge.sync",
      projectId,
      revision: input.revision,
      contentHash: input.contentHash,
    };
    this.emit("update", event);
    this.emit(`update:${projectId}`, event);
  }

  subscribe(projectId: string, listener: (event: DisplayBridgeUpdatedEvent) => void) {
    const channel = `update:${projectId}`;
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }
}
