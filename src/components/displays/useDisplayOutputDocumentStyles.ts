"use client";

import { useEffect } from "react";

export function useDisplayOutputDocumentStyles(
  displayWidth: number,
  displayHeight: number,
): void {
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
    };

    html.style.margin = "0";
    html.style.padding = "0";
    html.style.width = `${displayWidth}px`;
    html.style.height = `${displayHeight}px`;
    html.style.overflow = "hidden";
    html.style.background = "transparent";
    html.style.backgroundColor = "transparent";

    body.style.margin = "0";
    body.style.padding = "0";
    body.style.width = `${displayWidth}px`;
    body.style.height = `${displayHeight}px`;
    body.style.overflow = "hidden";
    body.style.background = "transparent";
    body.style.backgroundColor = "transparent";

    if (root) {
      root.style.background = "transparent";
      root.style.backgroundColor = "transparent";
      root.style.padding = "0";
      root.style.margin = "0";
      root.style.overflow = "hidden";
    }

    return () => {
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
      }
    };
  }, [displayHeight, displayWidth]);
}
