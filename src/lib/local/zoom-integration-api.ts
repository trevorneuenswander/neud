import { localFetch } from "@/lib/local/api";

export type ZoomOAuthMode = "development" | "production";

export type ZoomPublicConfigStatus = {
  appConfigured: boolean;
  userConnected: boolean;
  configured: boolean;
  authState:
    | "not_configured"
    | "app_configured"
    | "connecting"
    | "connected"
    | "expired"
    | "error"
    | "rtms_unavailable";
  connectedAs: string | null;
  publicClientIdMasked: string | null;
  clientIdMasked: string | null;
  oauthMode: ZoomOAuthMode;
  developmentConfigured: boolean;
  productionConfigured: boolean;
  accountIdMasked: null;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  friendlyMessage: string;
  mechanism: string;
  oauthRedirectUri: string;
};

export async function localGetZoomIntegrationStatus() {
  return localFetch<{ status: ZoomPublicConfigStatus }>("/api/integrations/zoom");
}

/** Developer Setup — Public Client ID(s) + OAuth mode (no Client Secret). */
export async function localSaveZoomAppCredentials(input: {
  oauthMode?: ZoomOAuthMode;
  developmentPublicClientId?: string;
  productionPublicClientId?: string;
  /** @deprecated Maps to developmentPublicClientId. */
  publicClientId?: string;
}) {
  return localFetch<{ status: ZoomPublicConfigStatus }>(
    "/api/integrations/zoom/app-credentials",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

/** @deprecated Prefer localSaveZoomAppCredentials. */
export async function localSaveZoomCredentials(input: {
  publicClientId?: string;
  clientId?: string;
  oauthMode?: ZoomOAuthMode;
}) {
  return localSaveZoomAppCredentials({
    oauthMode: input.oauthMode,
    developmentPublicClientId:
      input.publicClientId || String(input.clientId ?? ""),
  });
}

export async function localClearZoomCredentials() {
  return localFetch<{ status: ZoomPublicConfigStatus }>("/api/integrations/zoom", {
    method: "DELETE",
  });
}

export async function localValidateZoomCredentials() {
  return localFetch<{ status: ZoomPublicConfigStatus }>(
    "/api/integrations/zoom/validate",
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function localStartZoomOAuth() {
  return localFetch<{ status: ZoomPublicConfigStatus }>(
    "/api/integrations/zoom/oauth/start",
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function localDisconnectZoomOAuth() {
  return localFetch<{ status: ZoomPublicConfigStatus }>(
    "/api/integrations/zoom/oauth/disconnect",
    { method: "POST", body: JSON.stringify({}) },
  );
}
