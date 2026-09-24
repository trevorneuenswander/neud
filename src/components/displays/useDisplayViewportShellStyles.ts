"use client";

import { useEffect } from "react";
import { DISPLAY_GRAPHIC_OUTPUT_BACKGROUND } from "@/lib/displays/display-graphic-output-shell";

/** Transparent fullscreen/window-fit shell — fills the browser viewport. */
export function useDisplayViewportShellStyles(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("neud-app-content");

    const previous = {
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

    html.classList.add("neud-fullscreen-output");
    body.classList.add("neud-fullscreen-output");
    html.style.margin = "0";
    html.style.padding = "0";
    html.style.width = "100%";
    html.style.height = "100%";
    html.style.overflow = "hidden";
    html.style.background = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND;
    html.style.backgroundColor = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND;

    body.style.margin = "0";
    body.style.padding = "0";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.background = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND;
    body.style.backgroundColor = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND;

    if (root) {
      root.style.background = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND;
      root.style.backgroundColor = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND;
      root.style.padding = "0";
      root.style.margin = "0";
      root.style.overflow = "hidden";
      root.style.width = "100%";
      root.style.height = "100%";
    }

    return () => {
      html.classList.remove("neud-fullscreen-output");
      body.classList.remove("neud-fullscreen-output");
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
  }, []);
}
