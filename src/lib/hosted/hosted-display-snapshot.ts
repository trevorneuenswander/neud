import type { HostedDisplayStatusInput } from "@/lib/hosted/hosted-display-connection-status";

export type HostedDisplayCardDisplay = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_width: number | null;
  display_height: number | null;
  enabled: boolean;
  online_viewer_enabled: boolean;
  online_visibility: "private" | "public";
  online_published_at: string | null;
  online_published_revision_id: string | null;
  online_publish_error: string | null;
  refresh_rate_ms: number | null;
};

export function toHostedDisplayStatusInput(
  display: HostedDisplayCardDisplay,
  options?: {
    authorized?: boolean;
    displayExists?: boolean;
    portalSessionPresent?: boolean;
  },
): HostedDisplayStatusInput {
  return {
    displayExists: options?.displayExists ?? true,
    displayEnabled: display.enabled,
    onlineViewerEnabled: display.online_viewer_enabled,
    visibility: display.online_visibility,
    publishedRevisionPresent: Boolean(display.online_published_revision_id),
    onlinePublishedRevisionPresent: Boolean(display.online_published_revision_id),
    publishError: display.online_publish_error,
    publisherOnline: null,
    authorized: options?.authorized ?? true,
    portalSessionPresent: options?.portalSessionPresent ?? false,
    authenticatedViewerAuthorized: options?.authorized ?? null,
  };
}

export function mapActiveDisplayToCardDisplay(display: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_width: number | null;
  display_height: number | null;
  enabled: boolean;
  online_viewer_enabled: boolean;
  online_visibility: "private" | "public";
  online_published_at: string | null;
  online_published_revision_id: string | null;
  online_publish_error: string | null;
  refresh_rate_ms: number | null;
}): HostedDisplayCardDisplay {
  return {
    id: display.id,
    slug: display.slug,
    name: display.name,
    description: display.description,
    display_width: display.display_width,
    display_height: display.display_height,
    enabled: display.enabled,
    online_viewer_enabled: display.online_viewer_enabled,
    online_visibility: display.online_visibility,
    online_published_at: display.online_published_at,
    online_published_revision_id: display.online_published_revision_id,
    online_publish_error: display.online_publish_error,
    refresh_rate_ms: display.refresh_rate_ms,
  };
}
