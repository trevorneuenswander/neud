/**
 * Management graphic-only iframe shell — not Local URL, fullscreen, or Online Viewer output.
 * Keeps document chrome transparent so the wrapper checkerboard shows through display alpha.
 */
export function applyGraphicOnlyIframeTransparency(iframe: HTMLIFrameElement | null): void {
  if (!iframe) {
    return;
  }

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      return;
    }

    const pinnedPreview =
      doc.defaultView != null &&
      new URLSearchParams(doc.defaultView.location.search).get("pinnedPreview") === "1";

    const shellSelectors = [
      doc.documentElement,
      doc.body,
      doc.querySelector(".viewport"),
      doc.querySelector(".display-stage"),
    ];
    for (const element of shellSelectors) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      element.style.background = "transparent";
      element.style.backgroundColor = "transparent";
    }

    if (pinnedPreview) {
      doc.querySelectorAll(".layout-guide").forEach((node) => {
        if (node instanceof HTMLElement) {
          node.style.display = "none";
        }
      });
      const status = doc.getElementById("status");
      if (status instanceof HTMLElement) {
        status.style.display = "none";
      }
    }
  } catch {
    // Cross-origin or inaccessible document — iframe element styles remain transparent.
  }
}

export function scheduleGraphicOnlyIframeTransparency(
  iframe: HTMLIFrameElement | null,
): void {
  applyGraphicOnlyIframeTransparency(iframe);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => applyGraphicOnlyIframeTransparency(iframe));
  }
}
