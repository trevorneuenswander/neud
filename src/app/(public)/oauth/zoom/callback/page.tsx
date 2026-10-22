import { Suspense } from "react";
import { ZoomOAuthCallbackBridge } from "@/components/zoom/ZoomOAuthCallbackBridge";
import { ZoomOAuthStatusCard } from "@/components/zoom/ZoomOAuthStatusCard";

export const dynamic = "force-dynamic";

function ConnectingFallback() {
  return (
    <ZoomOAuthStatusCard
      tone="primary"
      icon={
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
      }
      heading="Connecting Zoom to NEUD"
      description="Returning you to the NEUD desktop application."
    />
  );
}

export default function ZoomOAuthHttpsCallbackPage() {
  return (
    <Suspense fallback={<ConnectingFallback />}>
      <ZoomOAuthCallbackBridge />
    </Suspense>
  );
}
