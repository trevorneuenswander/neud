"use client";

import { DisplayCard } from "@/components/displays/DisplayCard";
import {
  buildDisplayRegistry,
  PYLON_DISPLAY_ID,
} from "@/lib/displays/registry";

type PylonDisplayCardProps = {
  initialEnabled: boolean;
  hasLiveSnapshot?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
};

function hasPylonLivePayload(payload: Record<string, unknown>): boolean {
  if (!payload || payload.enabled === false || payload.status === "display_disabled") {
    return false;
  }

  const auctionDisplay = payload.auctionDisplay;
  if (!auctionDisplay || typeof auctionDisplay !== "object") {
    return false;
  }

  const display = auctionDisplay as Record<string, unknown>;
  return Boolean(
    display.title ||
      display.lot ||
      display.biddingPrice ||
      (Array.isArray(display.photos) && display.photos.length > 0),
  );
}

export function PylonDisplayCard({
  initialEnabled,
  hasLiveSnapshot = false,
  onEnabledChange,
}: PylonDisplayCardProps) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
  const display = buildDisplayRegistry({
    baseUrl: origin,
    pylonEnabled: initialEnabled,
    lowerTickerV5Enabled: true,
  }).find((entry) => entry.id === PYLON_DISPLAY_ID);

  if (!display) {
    return null;
  }

  return (
    <DisplayCard
      display={display}
      initialEnabled={initialEnabled}
      hasLiveSnapshot={hasLiveSnapshot}
      onEnabledChange={onEnabledChange}
      hasLivePayload={hasPylonLivePayload}
    />
  );
}
