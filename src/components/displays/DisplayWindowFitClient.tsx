"use client";

import { useMemo } from "react";
import { DisplayViewerScaledCanvas } from "@/components/displays/DisplayViewerScaledCanvas";
import { useDisplayWindowFitViewerStyles } from "@/components/displays/useDisplayWindowFitViewerStyles";
import { appendStreamBidDebugParams } from "@/lib/displays/display-view-mode";

type DisplayWindowFitClientProps = {
  targetUrl: string;
  displayWidth: number;
  displayHeight: number;
  surface?: "preview" | "computer" | "decklink";
  hideCursor?: boolean;
};

export function DisplayWindowFitClient({
  targetUrl,
  displayWidth,
  displayHeight,
  surface = "preview",
  hideCursor = false,
}: DisplayWindowFitClientProps) {
  useDisplayWindowFitViewerStyles({ surface, hideCursor });
  const computerOutput = surface === "computer";
  const iframeSrc = useMemo(() => {
    if (typeof window === "undefined") return targetUrl;
    const pageParams = new URLSearchParams(window.location.search);
    if (!pageParams.has("titleFixture") && !pageParams.has("titleFontDiag")) {
      return targetUrl;
    }
    try {
      const url = new URL(targetUrl, window.location.origin);
      appendStreamBidDebugParams(url.searchParams, pageParams);
      if (targetUrl.startsWith("/") && !targetUrl.startsWith("//")) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
      return url.toString();
    } catch {
      return targetUrl;
    }
  }, [targetUrl]);

  return (
    <div
      className={`output-surface fixed inset-0 overflow-hidden ${hideCursor ? "cursor-none" : ""}`}
      style={
        computerOutput
          ? { backgroundColor: "#000000" }
          : surface === "decklink"
            ? { backgroundColor: "transparent" }
            : undefined
      }
    >
      <DisplayViewerScaledCanvas
        displayWidth={displayWidth}
        displayHeight={displayHeight}
        allowUpscale
        paintScaleWithZoom={surface === "decklink"}
        fillMode={surface === "computer" || surface === "decklink" ? "stretch" : "contain"}
        backgroundColor={
          computerOutput ? "#000000" : surface === "decklink" ? "transparent" : undefined
        }
        className="h-full w-full"
      >
        <iframe
          title="NEUD display output"
          src={iframeSrc}
          className="display-output-iframe h-full w-full border-0 bg-transparent"
          onLoad={(event) => {
            if (!computerOutput || !hideCursor) return;
            const frame = event.currentTarget;
            try {
              const doc = frame.contentDocument;
              if (!doc?.documentElement) return;
              const style = doc.createElement("style");
              style.setAttribute("data-neud-output-cursor", "hidden");
              style.textContent = "html, body, * { cursor: none !important; }";
              doc.documentElement.appendChild(style);
            } catch {
              // Cross-origin iframe content keeps its own cursor.
            }
          }}
          style={{
            display: "block",
            margin: 0,
            padding: 0,
            background: "transparent",
            backgroundColor: "transparent",
            cursor: hideCursor ? "none" : undefined,
            pointerEvents: computerOutput ? "none" : undefined,
          }}
        />
      </DisplayViewerScaledCanvas>
    </div>
  );
}
