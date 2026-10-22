"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import {
  localGetLiveChatState,
  localLiveChatClearQueue,
  localLiveChatConnect,
  localLiveChatDisconnect,
  localLiveChatHideCurrent,
  localLiveChatManualMessage,
  localLiveChatSelectProvider,
  localLiveChatSetMode,
  localLiveChatSkip,
  localLiveChatTake,
  type LiveChatMode,
  type LiveChatProviderId,
  type LiveChatState,
  type YouTubeLiveChatPublicStatus,
  type ZoomLiveChatPublicStatus,
} from "@/lib/local/live-chat-api";
import {
  localCancelYouTubeOAuth,
  localDisconnectYouTubeOAuth,
  localSaveYouTubeClientId,
  localStartYouTubeOAuth,
} from "@/lib/local/youtube-integration-api";
import {
  localClearZoomCredentials,
  localDisconnectZoomOAuth,
  localSaveZoomAppCredentials,
  localStartZoomOAuth,
} from "@/lib/local/zoom-integration-api";
import { openExternalUrl } from "@/lib/desktop/open-external-url";

type LiveChatClientProps = {
  projectSlug: string;
  canOperate: boolean;
  canConfigure: boolean;
};

const PROVIDER_OPTIONS: Array<{ id: LiveChatProviderId; label: string }> = [
  { id: "zoom", label: "Zoom" },
  { id: "youtube-live", label: "YouTube Live" },
  { id: "facebook-live", label: "Facebook Live" },
  { id: "manual", label: "Manual / Test" },
];

const ZOOM_MARKETPLACE_URL = "https://marketplace.zoom.us/develop/create";

function youtubeConnectionLabel(
  connectionStatus: string,
  youtube: YouTubeLiveChatPublicStatus | null,
): string {
  if (!youtube || youtube.authState === "not_configured" || !youtube.configured) {
    return "Not configured";
  }
  if (youtube.authState === "pending") return "Authorization pending";
  if (youtube.authState === "cancelled") return "Authorization cancelled";
  if (youtube.authState === "timed_out") return "Authorization timed out";
  if (youtube.authState === "denied") return "Authorization denied";
  if (youtube.authState === "exchange_failed") return "Token exchange failed";
  if (youtube.authState === "revoked") return "Authorization revoked";
  if (youtube.authState === "error") return "Error";
  if (!youtube.userConnected) return "Configured — account disconnected";
  if (youtube.authState === "expired") return "Access expired — refresh pending";
  if (connectionStatus === "connected") return "Connected";
  if (connectionStatus === "connecting") return "Connecting";
  if (connectionStatus === "error") return "Error";
  if (connectionStatus === "authentication_required") return "Authentication required";
  return "Disconnected";
}

function zoomFriendlyState(status: ZoomLiveChatPublicStatus | null): string {
  if (!status) return "Zoom is not connected";
  return status.friendlyMessage || "Zoom is not connected";
}

export function LiveChatClient({
  projectSlug,
  canOperate,
  canConfigure,
}: LiveChatClientProps) {
  const [state, setState] = useState<LiveChatState | null>(null);
  const [zoomStatus, setZoomStatus] = useState<ZoomLiveChatPublicStatus | null>(
    null,
  );
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeLiveChatPublicStatus | null>(
    null,
  );
  const [youtubeClientId, setYoutubeClientId] = useState("");
  const [youtubeClientSecret, setYoutubeClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authorName, setAuthorName] = useState("Operator");
  const [messageText, setMessageText] = useState("");
  const [zoomSourceMode, setZoomSourceMode] = useState<"meeting" | "webinar">(
    "meeting",
  );
  const [zoomId, setZoomId] = useState("");
  const [youtubeId, setYoutubeId] = useState("");
  const [facebookId, setFacebookId] = useState("");
  const [oauthMode, setOauthMode] = useState<"development" | "production">(
    "development",
  );
  const [developmentPublicClientId, setDevelopmentPublicClientId] = useState("");
  const [productionPublicClientId, setProductionPublicClientId] = useState("");
  const [showDeveloperSetup, setShowDeveloperSetup] = useState(false);
  const [showZoomHelp, setShowZoomHelp] = useState(false);

  const refresh = useCallback(async () => {
    const result = await localGetLiveChatState(projectSlug);
    setState(result.state);
    setZoomStatus(result.zoom ?? null);
    setYoutubeStatus(result.youtube ?? null);
    if (result.zoom?.oauthMode === "production" || result.zoom?.oauthMode === "development") {
      setOauthMode(result.zoom.oauthMode);
    }
    const settings = result.state.connection;
    if (settings.sourceMode === "webinar" || settings.sourceMode === "meeting") {
      setZoomSourceMode(settings.sourceMode);
    }
    if (result.state.provider === "youtube-live") {
      if (settings.meetingOrBroadcastId) {
        setYoutubeId((current) => current || settings.meetingOrBroadcastId || "");
      }
    } else if (settings.meetingOrBroadcastId) {
      setZoomId((current) => current || settings.meetingOrBroadcastId || "");
    }
  }, [projectSlug]);

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load Live Chat.");
    });
    const timer = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function run(action: () => Promise<{ state: LiveChatState }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setState(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live Chat action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runYouTubeConfig(
    action: () => Promise<{ status: YouTubeLiveChatPublicStatus }>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setYoutubeStatus(result.status);
      setYoutubeClientId("");
      setYoutubeClientSecret("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "YouTube settings update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runZoomConfig(
    action: () => Promise<{ status: ZoomLiveChatPublicStatus }>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setZoomStatus(result.status as ZoomLiveChatPublicStatus);
      if (result.status.oauthMode) {
        setOauthMode(result.status.oauthMode);
      }
      setDevelopmentPublicClientId("");
      setProductionPublicClientId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoom settings update failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <Card className="p-6">
        {error ? <Alert variant="error">{error}</Alert> : (
          <p className="text-sm text-muted">Loading Live Chat…</p>
        )}
      </Card>
    );
  }

  const connected =
    state.connection.status === "connected" ||
    state.connection.status === "connecting";
  const zoomUserConnected = Boolean(zoomStatus?.userConnected);
  const zoomAppConfigured = Boolean(zoomStatus?.appConfigured);
  const zoomConnecting = zoomStatus?.authState === "connecting";

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-medium text-foreground">Connection</h2>
          <p className="mt-1 text-sm text-muted">
            {state.provider === "zoom"
              ? zoomFriendlyState(zoomStatus)
              : state.provider === "youtube-live"
                ? `YouTube: ${youtubeConnectionLabel(state.connection.status, youtubeStatus)}${
                    state.connection.detail ? ` — ${state.connection.detail}` : ""
                  }`
              : `Provider status: ${state.connection.status}${
                  state.connection.detail ? ` — ${state.connection.detail}` : ""
                }`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDER_OPTIONS.map((provider) => {
            const selected = state.provider === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                disabled={!canConfigure || busy || connected}
                onClick={() =>
                  void run(() =>
                    localLiveChatSelectProvider(projectSlug, provider.id),
                  )
                }
                className={`cursor-pointer rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:bg-surface-raised"
                }`}
              >
                <span className="block text-sm font-medium text-foreground">
                  {provider.label}
                </span>
              </button>
            );
          })}
        </div>

        {state.provider === "zoom" ? (
          <div id="zoom-connection" className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="text-base font-medium text-foreground">
                Zoom Connection
              </h3>
              <p className="mt-1 text-sm text-muted">
                Zoom authorization is stored securely on this computer and can be
                used by Live Chat projects. Meeting settings below stay
                project-specific.
              </p>
            </div>

            <div className="rounded-md border border-border bg-surface-raised p-3 space-y-3">
              <p className="text-sm font-medium text-foreground">
                {zoomUserConnected
                  ? `Connected as ${zoomStatus?.connectedAs ?? "Zoom user"}`
                  : zoomConnecting
                    ? "Connecting to Zoom"
                    : "Zoom is not connected"}
              </p>
              <div className="flex flex-wrap gap-2">
                {zoomUserConnected ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canOperate || busy}
                    onClick={() =>
                      void runZoomConfig(() => localDisconnectZoomOAuth())
                    }
                  >
                    Disconnect Zoom
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!canOperate || busy || !zoomAppConfigured}
                    onClick={() => void runZoomConfig(() => localStartZoomOAuth())}
                  >
                    Connect Zoom
                  </Button>
                )}
                <button
                  type="button"
                  className="cursor-pointer text-sm text-primary underline-offset-2 hover:underline"
                  onClick={() => setShowZoomHelp((open) => !open)}
                >
                  RTMS setup requirements
                </button>
              </div>
              {!zoomAppConfigured ? (
                <p className="text-xs text-muted">
                  Zoom Public Client ID required — open Developer Setup below to
                  save the Zoom Public Client ID first.
                </p>
              ) : null}
            </div>

            {showZoomHelp ? (
              <div className="space-y-2 rounded-md border border-border bg-surface-raised p-3 text-sm text-muted">
                <p className="font-medium text-foreground">Zoom RTMS requires:</p>
                <ul className="list-disc space-y-1 pl-5 text-foreground">
                  <li>NEUD General App configured on this computer</li>
                  <li>RTMS features enabled on the Zoom app</li>
                  <li>App authorized to the Zoom user/account (Connect Zoom)</li>
                  <li>
                    Zoom realtime-content sharing enabled by the account/admin
                  </li>
                  <li>
                    Zoom Developer Pack / RTMS entitlement as required by Zoom
                  </li>
                </ul>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void openExternalUrl(ZOOM_MARKETPLACE_URL)}
                >
                  Open Zoom App Marketplace
                </Button>
              </div>
            ) : null}

            {canConfigure ? (
              <div className="space-y-3 border-t border-border pt-4">
                <button
                  type="button"
                  className="cursor-pointer text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowDeveloperSetup((open) => !open)}
                >
                  Developer Setup {showDeveloperSetup ? "▾" : "▸"}
                </button>
                {showDeveloperSetup ? (
                  <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                    <p className="text-xs text-muted">
                      Alpha only. Development uses ephemeral{" "}
                      <span className="font-mono">127.0.0.1</span> loopback.
                      Production/Beta uses{" "}
                      <span className="font-mono">
                        https://neud.io/oauth/zoom/callback
                      </span>{" "}
                      which bridges to{" "}
                      <span className="font-mono">neud://</span>. No Client
                      Secret. Active redirect:{" "}
                      <span className="font-mono">
                        {zoomStatus?.oauthRedirectUri ??
                          "http://127.0.0.1/oauth/zoom/callback"}
                      </span>
                    </p>
                    <label className="block text-sm">
                      <span className="mb-1 block text-muted">OAuth mode</span>
                      <select
                        className="w-full rounded-md border border-border bg-surface px-3 py-2"
                        value={oauthMode}
                        disabled={busy}
                        onChange={(event) =>
                          setOauthMode(
                            event.target.value === "production"
                              ? "production"
                              : "development",
                          )
                        }
                      >
                        <option value="development">Development (loopback)</option>
                        <option value="production">
                          Production / Beta (neud.io HTTPS)
                        </option>
                      </select>
                    </label>
                    {zoomAppConfigured ? (
                      <p className="text-sm text-foreground">
                        Active Public Client ID configured
                        {zoomStatus?.publicClientIdMasked ||
                        zoomStatus?.clientIdMasked
                          ? ` (${zoomStatus.publicClientIdMasked ?? zoomStatus.clientIdMasked})`
                          : ""}{" "}
                        · mode {zoomStatus?.oauthMode ?? oauthMode}
                      </p>
                    ) : null}
                    <FormField
                      id="zoom-dev-public-client-id"
                      name="developmentPublicClientId"
                      label="Development Public Client ID"
                      value={developmentPublicClientId}
                      disabled={busy}
                      onChange={(event) =>
                        setDevelopmentPublicClientId(event.target.value)
                      }
                      autoComplete="off"
                    />
                    <FormField
                      id="zoom-prod-public-client-id"
                      name="productionPublicClientId"
                      label="Production Public Client ID"
                      value={productionPublicClientId}
                      disabled={busy}
                      onChange={(event) =>
                        setProductionPublicClientId(event.target.value)
                      }
                      autoComplete="off"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={
                          busy ||
                          (!developmentPublicClientId.trim() &&
                            !productionPublicClientId.trim() &&
                            !zoomAppConfigured)
                        }
                        onClick={() =>
                          void runZoomConfig(() =>
                            localSaveZoomAppCredentials({
                              oauthMode,
                              developmentPublicClientId:
                                developmentPublicClientId.trim() || undefined,
                              productionPublicClientId:
                                productionPublicClientId.trim() || undefined,
                            }),
                          )
                        }
                      >
                        Save Zoom OAuth Settings
                      </Button>
                      {zoomAppConfigured ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void runZoomConfig(() => localClearZoomCredentials())
                          }
                        >
                          Clear Zoom OAuth Settings
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Source Type</span>
                <select
                  className="w-full rounded-md border border-border bg-surface px-3 py-2"
                  value={zoomSourceMode}
                  disabled={!canConfigure || connected}
                  onChange={(event) =>
                    setZoomSourceMode(
                      event.target.value === "webinar" ? "webinar" : "meeting",
                    )
                  }
                >
                  <option value="meeting">Meeting</option>
                  <option value="webinar">Webinar</option>
                </select>
              </label>
              <FormField
                id="zoom-id"
                name="zoomId"
                label={
                  zoomSourceMode === "webinar" ? "Webinar ID" : "Meeting ID"
                }
                required={false}
                value={zoomId}
                disabled={!canConfigure || connected}
                onChange={(event) => setZoomId(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {state.provider === "youtube-live" ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="text-base font-medium text-foreground">YouTube Account</h3>
              <p className="mt-1 text-sm text-muted">
                {youtubeStatus?.userConnected && youtubeStatus.connectedAs
                  ? `Connected as ${youtubeStatus.connectedAs}`
                  : youtubeStatus?.friendlyMessage || "YouTube OAuth is not configured."}
              </p>
            </div>
            {state.connection.status === "connected" && state.connection.detail ? (
              <p className="text-sm text-foreground">
                Status: Connected — {state.connection.detail}
              </p>
            ) : null}
            {canConfigure ? (
              <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <FormField
                  id="youtube-client-id"
                  name="youtubeClientId"
                  label="OAuth client ID"
                  required={false}
                  value={youtubeClientId}
                  onChange={(event) => setYoutubeClientId(event.target.value)}
                />
                <FormField
                  id="youtube-client-secret"
                  name="youtubeClientSecret"
                  label="OAuth client secret"
                  type="password"
                  required={false}
                  autoComplete="off"
                  value={youtubeClientSecret}
                  placeholder={
                    youtubeStatus?.clientSecretConfigured ? "Saved on this computer" : ""
                  }
                  onChange={(event) => setYoutubeClientSecret(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !youtubeClientId.trim()}
                  onClick={() =>
                    void runYouTubeConfig(() =>
                      localSaveYouTubeClientId(
                        youtubeClientId.trim(),
                        youtubeClientSecret.trim(),
                      ),
                    )
                  }
                >
                  Save OAuth client
                </Button>
                {youtubeStatus?.userConnected ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runYouTubeConfig(() => localDisconnectYouTubeOAuth())}
                  >
                    Disconnect account
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={
                      busy ||
                      !youtubeStatus?.configured ||
                      !youtubeStatus?.clientSecretConfigured
                    }
                    onClick={() => void runYouTubeConfig(() => localStartYouTubeOAuth())}
                  >
                    {youtubeStatus?.authState === "pending"
                      ? "Restart YouTube authorization"
                      : "Connect YouTube account"}
                  </Button>
                )}
                {youtubeStatus?.authState === "pending" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runYouTubeConfig(() => localCancelYouTubeOAuth())}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                Google requires the Desktop client secret for this OAuth client. It is saved
                with secure storage and is not shown again.
              </p>
              </div>
            ) : null}
            <FormField
              id="youtube-id"
              name="youtubeId"
              label="YouTube Live URL or Video ID"
              required={false}
              value={youtubeId}
              disabled={!canOperate || connected}
              onChange={(event) => setYoutubeId(event.target.value)}
            />
            <p className="text-xs text-muted">
              Paste a YouTube live URL or an 11-character video ID. Leave it empty to use the
              only live stream on the connected account.
            </p>
          </div>
        ) : null}

        {state.provider === "facebook-live" ? (
          <FormField
            id="facebook-id"
            name="facebookId"
            label="Live Video ID"
            required={false}
            value={facebookId}
            disabled={!canConfigure || connected}
            onChange={(event) => setFacebookId(event.target.value)}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {connected ? (
            <Button
              type="button"
              variant="secondary"
              disabled={!canOperate || busy}
              onClick={() => void run(() => localLiveChatDisconnect(projectSlug))}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={
                !canOperate ||
                busy ||
                (state.provider === "zoom" &&
                  (!zoomUserConnected || !zoomId.trim())) ||
                (state.provider === "youtube-live" && !youtubeStatus?.userConnected)
              }
              onClick={() =>
                void run(() =>
                  localLiveChatConnect(projectSlug, {
                    sourceMode: zoomSourceMode,
                    meetingOrWebinarId: zoomId,
                    videoOrBroadcastId: youtubeId,
                    liveVideoId: facebookId,
                  }),
                )
              }
            >
              {state.provider === "zoom" ? "Connect Zoom" : "Connect"}
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-foreground">Mode / Moderation</h2>
            <p className="mt-1 text-sm text-muted">
              Automatic puts messages on air immediately. Producer requires Take.
            </p>
          </div>
          <div className="flex gap-2">
            {(["automatic", "producer"] as LiveChatMode[]).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={state.mode === mode ? "primary" : "secondary"}
                size="sm"
                disabled={!canOperate || busy}
                onClick={() =>
                  void run(() => localLiveChatSetMode(projectSlug, mode))
                }
              >
                {mode === "automatic" ? "Automatic" : "Producer"}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canOperate || busy || !state.current}
              onClick={() => void run(() => localLiveChatHideCurrent(projectSlug))}
            >
              Hide Current
            </Button>
          </div>
        </div>

        {state.current ? (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="text-xs uppercase tracking-wide text-muted">On Air</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {state.current.authorName}
            </p>
            <p className="mt-1 text-foreground">{state.current.text}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No current on-air message.</p>
        )}

        {state.mode === "producer" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Review Queue</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canOperate || busy || state.incoming.length === 0}
                onClick={() => void run(() => localLiveChatClearQueue(projectSlug))}
              >
                Clear Queue
              </Button>
            </div>
            {state.incoming.length === 0 ? (
              <p className="text-sm text-muted">Queue is empty.</p>
            ) : (
              state.incoming.slice(0, 40).map((message) => (
                <div
                  key={message.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {message.authorName}
                    </p>
                    <p className="text-sm text-foreground">{message.text}</p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={!canOperate || busy}
                      onClick={() =>
                        void run(() => localLiveChatTake(projectSlug, message.id))
                      }
                    >
                      Take
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canOperate || busy}
                      onClick={() =>
                        void run(() => localLiveChatSkip(projectSlug, message.id))
                      }
                    >
                      Skip
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-medium text-foreground">Incoming Messages</h2>
          <p className="mt-1 text-sm text-muted">
            Newest first. Bounded session history.
          </p>
        </div>

        {state.provider === "manual" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <FormField
              id="manual-author"
              name="authorName"
              label="Author Name"
              required
              value={authorName}
              disabled={!canOperate || busy || !connected}
              onChange={(event) => setAuthorName(event.target.value)}
            />
            <FormField
              id="manual-text"
              name="messageText"
              label="Message"
              required
              value={messageText}
              disabled={!canOperate || busy || !connected}
              onChange={(event) => setMessageText(event.target.value)}
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="primary"
                disabled={!canOperate || busy || !connected}
                onClick={() => {
                  void run(async () => {
                    const result = await localLiveChatManualMessage(projectSlug, {
                      authorName,
                      text: messageText,
                    });
                    setMessageText("");
                    return result;
                  });
                }}
              >
                Submit
              </Button>
            </div>
          </div>
        ) : null}

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {state.incoming.length === 0 ? (
            <p className="text-sm text-muted">No incoming messages yet.</p>
          ) : (
            state.incoming.slice(0, 80).map((message) => (
              <div
                key={message.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {message.authorName}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(message.timestamp).toLocaleTimeString()} ·{" "}
                    {message.provider}
                  </span>
                </div>
                <p className="mt-1 text-foreground">{message.text}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="space-y-2 p-6">
        <h2 className="text-lg font-medium text-foreground">Diagnostics</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Provider</dt>
            <dd className="text-foreground">{state.diagnostics.provider}</dd>
          </div>
          <div>
            <dt className="text-muted">Connection</dt>
            <dd className="text-foreground">
              {state.diagnostics.connectionStatus}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Received</dt>
            <dd className="text-foreground">{state.diagnostics.receivedCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Approved</dt>
            <dd className="text-foreground">{state.diagnostics.approvedCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Rejected</dt>
            <dd className="text-foreground">{state.diagnostics.rejectedCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Current message</dt>
            <dd className="font-mono text-xs text-foreground">
              {state.diagnostics.currentMessageId ?? "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Last provider error</dt>
            <dd className="text-foreground">
              {state.diagnostics.lastProviderError ?? "—"}
            </dd>
          </div>
          {state.provider === "youtube-live" && canConfigure ? (
            <>
              <div>
                <dt className="text-muted">Video ID</dt>
                <dd className="font-mono text-xs text-foreground">
                  {String(state.diagnostics.providerDetails?.videoId ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Live chat ID</dt>
                <dd className="font-mono text-xs text-foreground">
                  {String(state.diagnostics.providerDetails?.liveChatId ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Ingestion</dt>
                <dd className="text-foreground">
                  {state.diagnostics.providerDetails?.ingestionMode === "polling"
                    ? "Polling fallback"
                    : state.diagnostics.providerDetails?.ingestionMode === "streaming"
                      ? "Streaming"
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Reconnects</dt>
                <dd className="text-foreground">
                  {String(state.diagnostics.providerDetails?.reconnectCount ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Last message received</dt>
                <dd className="text-foreground">
                  {typeof state.diagnostics.providerDetails?.lastMessageAt === "string"
                    ? state.diagnostics.providerDetails.lastMessageAt
                    : "—"}
                </dd>
              </div>
            </>
          ) : null}
          {state.provider === "zoom" ? (
            <>
              <div>
                <dt className="text-muted">App configured</dt>
                <dd className="text-foreground">
                  {zoomStatus?.appConfigured ? "yes" : "no"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">User connected</dt>
                <dd className="text-foreground">
                  {zoomStatus?.userConnected ? "yes" : "no"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Auth state</dt>
                <dd className="text-foreground">
                  {zoomStatus?.authState ?? "not_configured"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Connected as</dt>
                <dd className="text-foreground">
                  {zoomStatus?.connectedAs ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Meeting vs Webinar</dt>
                <dd className="text-foreground">
                  {state.connection.sourceMode ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Meeting / Webinar ID</dt>
                <dd className="font-mono text-xs text-foreground">
                  {state.connection.meetingOrBroadcastId ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Zoom RTMS validation</dt>
                <dd className="text-foreground">
                  {
                    "Implementation complete · OAuth validation pending · RTMS connection validation pending · Live chat-message validation pending"
                  }
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}
