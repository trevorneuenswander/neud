"use client";

import { DisplayViewerScaledCanvas } from "@/components/displays/DisplayViewerScaledCanvas";
import { useDisplayWindowFitViewerStyles } from "@/components/displays/useDisplayWindowFitViewerStyles";
type DisplayWindowFitClientProps = {
  targetUrl: string;
  displayWidth: number;
  displayHeight: number;
};

export function DisplayWindowFitClient({
  targetUrl,
  displayWidth,
  displayHeight,
}: DisplayWindowFitClientProps) {
  useDisplayWindowFitViewerStyles();

  return (
    <div className="fixed inset-0 overflow-hidden">
      <DisplayViewerScaledCanvas
        displayWidth={displayWidth}
        displayHeight={displayHeight}
        allowUpscale
        className="h-full w-full"
      >
        <iframe
          title="NEUD display output"
          src={targetUrl}
          className="display-output-iframe h-full w-full border-0 bg-transparent"
          style={{
            display: "block",
            margin: 0,
            padding: 0,
            background: "transparent",
            backgroundColor: "transparent",
          }}
        />
      </DisplayViewerScaledCanvas>
    </div>
  );
}
