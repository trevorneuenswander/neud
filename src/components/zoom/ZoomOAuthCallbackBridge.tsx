"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ZoomOAuthStatusCard } from "@/components/zoom/ZoomOAuthStatusCard";
import {
  extractZoomBridgeParams,
  zoomBridgeLaunchLink,
  zoomBridgeOutcome,
} from "@/lib/zoom/oauth-bridge";

type ReceivedPhase = "connecting" | "opening" | "return";

function launchNeudDeepLink(url: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.src = url;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 2000);
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14M13 6l6 6-6 6"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M6 12h12"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M7 7l10 10M17 7 7 17"
      />
    </svg>
  );
}

export function ZoomOAuthCallbackBridge() {
  const searchParams = useSearchParams();
  const [params] = useState(() => extractZoomBridgeParams(searchParams));
  const outcome = zoomBridgeOutcome(params);
  const deepLink = zoomBridgeLaunchLink(params);
  const [phase, setPhase] = useState<ReceivedPhase>("connecting");

  useEffect(() => {
    try {
      window.history.replaceState({}, "", "/oauth/zoom/callback");
    } catch {
      // The address bar can keep the query if the browser blocks replacement.
    }
  }, []);

  useEffect(() => {
    if (!deepLink) return;
    launchNeudDeepLink(deepLink);
    if (outcome !== "received") return;
    const openingTimer = window.setTimeout(() => setPhase("opening"), 700);
    const returnTimer = window.setTimeout(() => setPhase("return"), 2400);
    return () => {
      window.clearTimeout(openingTimer);
      window.clearTimeout(returnTimer);
    };
  }, [deepLink, outcome]);

  function openNeud() {
    if (!deepLink) return;
    launchNeudDeepLink(deepLink);
  }

  if (outcome === "denied") {
    return (
      <ZoomOAuthStatusCard
        tone="warning"
        icon={<MinusIcon />}
        heading="Zoom Authorization Cancelled"
        description="Your Zoom account was not connected."
        footnote="You can safely close this window and return to NEUD."
      />
    );
  }

  if (outcome !== "received" || !deepLink) {
    return (
      <ZoomOAuthStatusCard
        tone="danger"
        icon={<CrossIcon />}
        heading="Unable to Complete Authorization"
        description="The Zoom authorization response was incomplete or invalid. Return to NEUD and try again."
        footnote="You can safely close this window and return to NEUD."
      />
    );
  }

  if (phase === "opening") {
    return (
      <ZoomOAuthStatusCard
        tone="primary"
        icon={<ArrowIcon />}
        progress
        heading="Opening NEUD"
        description="We're returning you to the NEUD desktop application."
      />
    );
  }

  if (phase === "return") {
    return (
      <ZoomOAuthStatusCard
        tone="primary"
        icon={<ArrowIcon />}
        heading="Return to NEUD"
        description="If NEUD did not open automatically, use the button below to return to the application."
        action={
          <Button type="button" variant="primary" onClick={openNeud}>
            Open NEUD
          </Button>
        }
        footnote="You can safely close this window and return to NEUD."
      />
    );
  }

  return (
    <ZoomOAuthStatusCard
      tone="primary"
      icon={<ArrowIcon />}
      heading="Connecting Zoom to NEUD"
      description="Your authorization has been received. Returning to NEUD to finish connecting your account."
    />
  );
}
