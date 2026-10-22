"use client";

import { useEffect } from "react";
import { MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE } from "@/lib/displays/display-preview-checkerboard-style";

type WindowFitSurface = "preview" | "computer" | "decklink";

/** Window-fit viewer. Preview keeps the checkerboard. Computer-display output composites on black. */
export function useDisplayWindowFitViewerStyles(options?: {
  surface?: WindowFitSurface;
  hideCursor?: boolean;
}): void {
  const surface = options?.surface ?? "preview";
  const hideCursor = options?.hideCursor === true;
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("neud-app-content");

    const previous = {
      htmlClass: html.className,
      bodyClass: body.className,
      htmlMargin: html.style.margin,
      htmlPadding: html.style.padding,
      htmlWidth: html.style.width,
      htmlHeight: html.style.height,
      htmlOverflow: html.style.overflow,
      htmlBackground: html.style.background,
      htmlBackgroundColor: html.style.backgroundColor,
      bodyMargin: body.style.margin,
      bodyPadding: body.style.padding,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyOverflow: body.style.overflow,
      bodyBackground: body.style.background,
      bodyBackgroundColor: body.style.backgroundColor,
      rootBackground: root?.style.background ?? "",
      rootBackgroundColor: root?.style.backgroundColor ?? "",
      rootPadding: root?.style.padding ?? "",
      rootMargin: root?.style.margin ?? "",
      rootOverflow: root?.style.overflow ?? "",
      rootWidth: root?.style.width ?? "",
      rootHeight: root?.style.height ?? "",
    };

    html.classList.add("neud-window-fit-viewer");
    body.classList.add("neud-window-fit-viewer");
    html.style.margin = "0";
    html.style.padding = "0";
    html.style.border = "0";
    html.style.borderRadius = "0";
    html.style.width = "100vw";
    html.style.height = "100vh";
    html.style.overflow = "hidden";
    const outputBlack = surface === "computer";
    const preserveAlpha = surface === "decklink";
    html.style.background = outputBlack
      ? "#000000"
      : preserveAlpha
        ? "transparent"
        : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundImage;
    html.style.backgroundColor = outputBlack
      ? "#000000"
      : preserveAlpha
        ? "transparent"
        : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundColor;
    html.style.backgroundSize =
      outputBlack || preserveAlpha ? "auto" : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundSize;
    html.style.backgroundPosition =
      outputBlack || preserveAlpha ? "0 0" : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundPosition;
    html.style.cursor = hideCursor ? "none" : "";

    body.style.margin = "0";
    body.style.padding = "0";
    body.style.border = "0";
    body.style.borderRadius = "0";
    body.style.width = "100vw";
    body.style.height = "100vh";
    body.style.overflow = "hidden";
    body.style.background = outputBlack
      ? "#000000"
      : preserveAlpha
        ? "transparent"
        : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundImage;
    body.style.backgroundColor = outputBlack
      ? "#000000"
      : preserveAlpha
        ? "transparent"
        : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundColor;
    body.style.backgroundSize =
      outputBlack || preserveAlpha ? "auto" : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundSize;
    body.style.backgroundPosition =
      outputBlack || preserveAlpha ? "0 0" : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundPosition;
    body.style.cursor = hideCursor ? "none" : "";

    if (root) {
      root.style.background = outputBlack
        ? "#000000"
        : preserveAlpha
          ? "transparent"
          : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundImage;
      root.style.backgroundColor = outputBlack
        ? "#000000"
        : preserveAlpha
          ? "transparent"
          : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundColor;
      root.style.backgroundSize =
        outputBlack || preserveAlpha ? "auto" : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundSize;
      root.style.backgroundPosition =
        outputBlack || preserveAlpha ? "0 0" : MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE.backgroundPosition;
      root.style.cursor = hideCursor ? "none" : "";
      root.style.padding = "0";
      root.style.margin = "0";
      root.style.border = "0";
      root.style.borderRadius = "0";
      root.style.overflow = "hidden";
      root.style.width = "100vw";
      root.style.height = "100vh";
    }

    return () => {
      html.className = previous.htmlClass;
      body.className = previous.bodyClass;
      html.style.margin = previous.htmlMargin;
      html.style.padding = previous.htmlPadding;
      html.style.width = previous.htmlWidth;
      html.style.height = previous.htmlHeight;
      html.style.overflow = previous.htmlOverflow;
      html.style.background = previous.htmlBackground;
      html.style.backgroundColor = previous.htmlBackgroundColor;
      body.style.margin = previous.bodyMargin;
      body.style.padding = previous.bodyPadding;
      body.style.width = previous.bodyWidth;
      body.style.height = previous.bodyHeight;
      body.style.overflow = previous.bodyOverflow;
      body.style.background = previous.bodyBackground;
      body.style.backgroundColor = previous.bodyBackgroundColor;
      if (root) {
        root.style.background = previous.rootBackground;
        root.style.backgroundColor = previous.rootBackgroundColor;
        root.style.padding = previous.rootPadding;
        root.style.margin = previous.rootMargin;
        root.style.overflow = previous.rootOverflow;
        root.style.width = previous.rootWidth;
        root.style.height = previous.rootHeight;
      }
    };
  }, [surface, hideCursor]);
}
