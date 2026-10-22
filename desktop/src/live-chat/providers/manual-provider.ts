import { randomUUID } from "crypto";
import type {
  LiveChatMessage,
  LiveChatProvider,
  LiveChatProviderStatus,
} from "../types";

export class ManualLiveChatProvider implements LiveChatProvider {
  readonly id = "manual" as const;
  readonly label = "Manual / Test";
  readonly connectionRequirements = ["None — operator-entered messages"];

  private status: LiveChatProviderStatus = {
    provider: "manual",
    status: "disconnected",
    label: this.label,
    detail: null,
    lastError: null,
  };
  private listeners = new Set<(message: LiveChatMessage) => void>();

  async connect(_settings: Record<string, unknown>): Promise<LiveChatProviderStatus> {
    this.status = {
      ...this.status,
      status: "connected",
      detail: "Manual / Test source ready",
      lastError: null,
      sourceMode: "manual",
    };
    return this.status;
  }

  async disconnect(): Promise<LiveChatProviderStatus> {
    this.status = {
      ...this.status,
      status: "disconnected",
      detail: null,
    };
    return this.status;
  }

  getStatus(): LiveChatProviderStatus {
    return { ...this.status };
  }

  subscribeMessages(onMessage: (message: LiveChatMessage) => void): () => void {
    this.listeners.add(onMessage);
    return () => {
      this.listeners.delete(onMessage);
    };
  }

  /** Inject a test message into the normalized pipeline. */
  submit(input: { authorName: string; text: string }): LiveChatMessage {
    if (this.status.status !== "connected") {
      throw new Error("Connect Manual / Test before submitting messages.");
    }
    const authorName = input.authorName.trim() || "Operator";
    const text = input.text.trim();
    if (!text) {
      throw new Error("Message text is required.");
    }
    const message: LiveChatMessage = {
      id: randomUUID(),
      provider: "manual",
      providerMessageId: randomUUID(),
      timestamp: new Date().toISOString(),
      authorName,
      text,
    };
    this.status = {
      ...this.status,
      lastMessageAt: message.timestamp,
    };
    for (const listener of this.listeners) {
      listener(message);
    }
    return message;
  }
}
