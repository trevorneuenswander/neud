"use client";

import { Switch } from "@/components/ui/Switch";
import {
  ONLINE_VIEWER_DISPLAY_DISABLED_REASON,
  type UseOnlineViewerSettingsResult,
} from "@/lib/displays/use-online-viewer-settings";

type OnlineViewerToggleProps = {
  canManage?: boolean;
  displayEnabled?: boolean;
  onlineViewer: UseOnlineViewerSettingsResult;
  displayName: string;
};

export function getOnlineViewerVisibilityHint(
  onlineViewer: UseOnlineViewerSettingsResult,
): string | undefined {
  if (onlineViewer.loading) {
    return "Loading online viewer settings…";
  }
  if (!onlineViewer.settings) {
    return undefined;
  }
  return onlineViewer.visibility === "public" ? "Public" : "Private";
}

export function getOnlineViewerStatusHint(
  onlineViewer: UseOnlineViewerSettingsResult,
  _displayEnabled = true,
): string | undefined {
  return getOnlineViewerVisibilityHint(onlineViewer);
}

export function OnlineViewerToggle({
  canManage = false,
  displayEnabled = true,
  onlineViewer,
  displayName,
}: OnlineViewerToggleProps) {
  const disabled =
    !displayEnabled ||
    !canManage ||
    onlineViewer.loading ||
    onlineViewer.busy ||
    Boolean(onlineViewer.unavailableReason);

  const disabledReason = !displayEnabled
    ? ONLINE_VIEWER_DISPLAY_DISABLED_REASON
    : onlineViewer.unavailableReason;
  const title =
    disabledReason ??
    (canManage
      ? "Enable or disable online viewing for this display."
      : "Only project owners and admins can change online viewing.");
  const describedById = !displayEnabled
    ? `online-viewer-disabled-${displayName.replace(/\s+/g, "-").toLowerCase()}`
    : undefined;

  return (
    <span title={title}>
      {describedById ? (
        <span id={describedById} className="sr-only">
          {ONLINE_VIEWER_DISPLAY_DISABLED_REASON}
        </span>
      ) : null}
      <Switch
        checked={onlineViewer.enabled}
        disabled={disabled}
        aria-label={`${displayName} online viewer`}
        aria-describedby={describedById}
        onCheckedChange={(nextEnabled) => {
          void onlineViewer.toggleEnabled(nextEnabled);
        }}
      />
    </span>
  );
}
