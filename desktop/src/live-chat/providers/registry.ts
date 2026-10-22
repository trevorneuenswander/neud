import type { LiveChatProvider, LiveChatProviderId } from "../types";
import { ManualLiveChatProvider } from "./manual-provider";
import { ZoomLiveChatProvider } from "./zoom-provider";
import { YouTubeLiveChatProvider } from "./youtube-provider";
import { FacebookLiveChatProvider } from "./facebook-provider";

export type LiveChatProviderFactory = () => LiveChatProvider;

const FACTORIES: Record<LiveChatProviderId, LiveChatProviderFactory> = {
  manual: () => new ManualLiveChatProvider(),
  zoom: () => new ZoomLiveChatProvider(),
  "youtube-live": () => new YouTubeLiveChatProvider(),
  "facebook-live": () => new FacebookLiveChatProvider(),
};

export const LIVE_CHAT_PROVIDER_CATALOG: Array<{
  id: LiveChatProviderId;
  label: string;
}> = [
  { id: "zoom", label: "Zoom" },
  { id: "youtube-live", label: "YouTube Live" },
  { id: "facebook-live", label: "Facebook Live" },
  { id: "manual", label: "Manual / Test" },
];

export function createLiveChatProvider(id: LiveChatProviderId): LiveChatProvider {
  const factory = FACTORIES[id];
  if (!factory) {
    throw new Error(`Unknown Live Chat provider: ${id}`);
  }
  return factory();
}

export function isLiveChatProviderId(value: string): value is LiveChatProviderId {
  return value in FACTORIES;
}
