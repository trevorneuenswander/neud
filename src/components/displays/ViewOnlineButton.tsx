"use client";

import { Button } from "@/components/ui/Button";
import { openExternalUrl } from "@/lib/desktop/open-external-url";
import { useHostedPortalOrigin } from "@/lib/hosted/use-hosted-portal-origin";
import { buildAbsoluteHostedFullscreenViewerUrl } from "@/lib/hosted/viewer-url";

type ViewOnlineButtonProps = {
  projectSlug: string;
  displaySlug: string;
  displayEnabled?: boolean;
  enabled: boolean;
  visibility: "private" | "public";
  loading?: boolean;
};

export function ViewOnlineButton({
  projectSlug,
  displaySlug,
  displayEnabled = true,
  enabled,
  visibility,
  loading = false,
}: ViewOnlineButtonProps) {
  const hostedPortal = useHostedPortalOrigin();
  const viewerUrl = buildAbsoluteHostedFullscreenViewerUrl(
    projectSlug,
    displaySlug,
    visibility,
    hostedPortal.origin,
  );
  const disabled =
    loading || hostedPortal.loading || !displayEnabled || !enabled || !viewerUrl;

  const disabledTitle = !displayEnabled
    ? "Enable this display before opening the hosted viewer."
    : !enabled
      ? "Turn on Online Viewer to open the hosted viewer."
      : !viewerUrl
        ? (hostedPortal.message ?? "Hosted portal URL is not configured.")
        : undefined;

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={disabled}
      title={disabledTitle}
      onClick={() => {
        if (!viewerUrl) {
          return;
        }
        void openExternalUrl(viewerUrl);
      }}
    >
      View Online
    </Button>
  );
}
