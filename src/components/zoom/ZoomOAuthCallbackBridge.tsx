"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NeudLogo } from "@/components/branding/NeudLogo";
import { Button } from "@/components/ui/Button";
import {
  buildNeudZoomDeepLink,
  extractZoomBridgeParams,
  zoomBridgeOutcome,
} from "@/lib/zoom/oauth-bridge";

export function ZoomOAuthCallbackBridge() {
  const searchParams = useSearchParams();
  const params = useMemo(
    () => extractZoomBridgeParams(searchParams),
    [searchParams],
  );
  const outcome = zoomBridgeOutcome(params);
  const deepLink = useMemo(() => buildNeudZoomDeepLink(params), [params]);
  const [launchAttempted, setLaunchAttempted] = useState(false);

  useEffect(() => {
    // Strip sensitive OAuth query values from the address bar.
    try {
      window.history.replaceState({}, "", "/oauth/zoom/callback");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (outcome === "empty") return;
    setLaunchAttempted(true);
    try {
      window.location.href = deepLink;
    } catch {
      // User can retry via button.
    }
  }, [deepLink, outcome]);

  function openNeud() {
    setLaunchAttempted(true);
    window.location.href = deepLink;
  }

  const isError = outcome === "error" || outcome === "empty";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <NeudLogo size="lg" href={null} showTagline={false} />
      <div className="mt-10 max-w-md space-y-4">
        {isError ? (
          <>
            <h1 className="text-2xl font-semibold text-foreground">
              Zoom connection was not completed
            </h1>
            <p className="text-sm text-muted">
              You can return to the NEUD desktop application and try Connect
              Zoom again.
            </p>
            <Button type="button" variant="primary" onClick={openNeud}>
              Return to NEUD
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-foreground">
              Zoom connected successfully
            </h1>
            <p className="text-sm text-muted">
              You can return to the NEUD desktop application.
            </p>
            <Button type="button" variant="primary" onClick={openNeud}>
              Open NEUD
            </Button>
            {launchAttempted ? (
              <p className="text-xs text-muted">
                If NEUD did not open automatically, click Open NEUD.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
