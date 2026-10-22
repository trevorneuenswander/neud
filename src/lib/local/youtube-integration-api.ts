import { localFetch } from "@/lib/local/api";
import type { YouTubeLiveChatPublicStatus } from "@/lib/local/live-chat-api";

export async function localSaveYouTubeClientId(clientId: string, clientSecret?: string) {
  return localFetch<{ status: YouTubeLiveChatPublicStatus }>(
    "/api/integrations/youtube/client-id",
    {
      method: "PUT",
      body: JSON.stringify({
        clientId,
        ...(clientSecret?.trim() ? { clientSecret: clientSecret.trim() } : {}),
      }),
    },
  );
}

export async function localStartYouTubeOAuth() {
  return localFetch<{ status: YouTubeLiveChatPublicStatus }>(
    "/api/integrations/youtube/oauth/start",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function localCancelYouTubeOAuth() {
  return localFetch<{ status: YouTubeLiveChatPublicStatus }>(
    "/api/integrations/youtube/oauth/cancel",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function localDisconnectYouTubeOAuth() {
  return localFetch<{ status: YouTubeLiveChatPublicStatus }>(
    "/api/integrations/youtube/oauth/disconnect",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}
