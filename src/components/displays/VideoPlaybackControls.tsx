"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getDesktopAPI } from "@/lib/desktop/client";

type VideoSession = {
  state: string;
  loop: boolean;
  error: string | null;
  hasFrame: boolean;
  info: {
    width: number;
    height: number;
    durationSeconds: number;
    frameRate: number;
    codecLabel: string;
  } | null;
};

type VideoPlaybackControlsProps = {
  displayId: string;
  canControl: boolean;
  /** Compact inline row for display cards (next to Edit) or pinned title row. */
  variant?: "card" | "panel" | "pinned";
};

const ICON_BUTTON_CLASS = "h-9 w-9 shrink-0 px-0";
const ICON_CLASS = "h-[18px] w-[18px] shrink-0";
/** Square pinned controls sized to fit the fixed 18px title row (override Button sm h-8). */
const PINNED_ICON_BUTTON_CLASS =
  "!h-4 !w-4 !min-h-4 !min-w-4 shrink-0 !p-0 !px-0 !rounded-sm";
const PINNED_ICON_CLASS = "h-2.5 w-2.5 shrink-0";

/** Solid filled play triangle. */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path fill="currentColor" d="M8 5.14v13.72L19 12 8 5.14z" />
    </svg>
  );
}

/** Two solid vertical bars. */
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect fill="currentColor" x="6" y="5" width="4" height="14" rx="0.5" />
      <rect fill="currentColor" x="14" y="5" width="4" height="14" rx="0.5" />
    </svg>
  );
}

/** Solid filled stop square. */
function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect fill="currentColor" x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

/**
 * Displays-page playback controls for project-video displays.
 * Transient play/pause state is owned by the local decoder runtime.
 */
export function VideoPlaybackControls({
  displayId,
  canControl,
  variant = "panel",
}: VideoPlaybackControlsProps) {
  const [session, setSession] = useState<VideoSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api?.video?.getStatus) return;
    const result = await api.video.getStatus(displayId);
    if (result.ok) {
      setSession(result.session);
      setError(result.session.error);
    } else {
      setError(result.error ?? "Video unavailable.");
    }
  }, [displayId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  async function run(action: "play" | "pause" | "stop" | "restart") {
    const api = getDesktopAPI();
    if (!api?.video || !canControl || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.video[action](displayId);
      if (!result.ok) {
        setError(result.error ?? `Unable to ${action}.`);
      } else if (result.session && typeof result.session === "object") {
        setSession(result.session as VideoSession);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${action}.`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLoop() {
    const api = getDesktopAPI();
    if (!api?.video?.setLoop || !canControl || busy) return;
    const next = !(session?.loop ?? false);
    setBusy(true);
    try {
      const result = await api.video.setLoop(displayId, next);
      if (!result.ok) setError(result.error ?? "Unable to update loop.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = session?.state ?? "idle";
  const playing = stateLabel === "playing";
  const loopOn = session?.loop === true;
  const pinned = variant === "pinned";
  const buttonClass = pinned ? PINNED_ICON_BUTTON_CLASS : ICON_BUTTON_CLASS;
  const iconClass = pinned ? PINNED_ICON_CLASS : ICON_CLASS;

  const controls = (
    <div
      className={`flex items-center ${pinned ? "gap-0.5" : "flex-wrap gap-1.5"}`}
      role="group"
      aria-label={`Video playback for display ${displayId}`}
      data-video-playback-variant={variant}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        size="sm"
        className={buttonClass}
        disabled={!canControl || busy || playing}
        title="Play"
        aria-label="Play"
        onClick={() => void run("play")}
      >
        <PlayIcon className={iconClass} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={buttonClass}
        disabled={!canControl || busy || !playing}
        title="Pause"
        aria-label="Pause"
        onClick={() => void run("pause")}
      >
        <PauseIcon className={iconClass} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={buttonClass}
        disabled={!canControl || busy}
        title="Restart"
        aria-label="Restart"
        onClick={() => void run("restart")}
      >
        <RotateCcw className={iconClass} strokeWidth={2.5} aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={buttonClass}
        disabled={!canControl || busy}
        title="Stop"
        aria-label="Stop"
        onClick={() => void run("stop")}
      >
        <StopIcon className={iconClass} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={`${buttonClass} ${
          loopOn ? "border-primary bg-primary/15 text-primary" : ""
        }`}
        disabled={!canControl || busy}
        title={loopOn ? "Loop on" : "Loop off"}
        aria-label={loopOn ? "Loop on" : "Loop off"}
        aria-pressed={loopOn}
        onClick={() => void toggleLoop()}
      >
        <Repeat className={iconClass} strokeWidth={2.5} aria-hidden />
      </Button>
    </div>
  );

  if (variant === "pinned") {
    return controls;
  }

  if (variant === "card") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        {controls}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-surface-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Video · {stateLabel}
        </p>
        {session?.info ? (
          <p className="text-xs text-muted">
            {session.info.width}×{session.info.height}
            {session.info.frameRate ? ` · ${session.info.frameRate.toFixed(2)} fps` : ""}
            {session.info.codecLabel ? ` · ${session.info.codecLabel}` : ""}
          </p>
        ) : null}
      </div>
      {controls}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
