import { Suspense } from "react";
import { ZoomOAuthCallbackBridge } from "@/components/zoom/ZoomOAuthCallbackBridge";

export const dynamic = "force-dynamic";

export default function ZoomOAuthHttpsCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center px-6 text-sm text-muted">
          Completing Zoom connection…
        </div>
      }
    >
      <ZoomOAuthCallbackBridge />
    </Suspense>
  );
}
