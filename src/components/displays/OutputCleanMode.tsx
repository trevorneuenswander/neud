"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveDisplayViewMode } from "@/lib/displays/display-view-mode";
import { isHostedFullscreenViewerPath } from "@/lib/routing/hosted-routes";

const CLEAN_STYLE_ID = "neud-output-clean-mode";

const CLEAN_CSS = `
/* Pass 13: never show Next/React/dev/operator chrome on program output. */
nextjs-portal,
[data-next-badge-root],
[data-nextjs-toast],
[data-nextjs-dialog-overlay],
[data-nextjs-dialog],
#__next-build-watcher,
#__next-dev-overlay,
.__next-error-overlay,
[data-react-error-overlay],
neud-dev-issue-badge,
[data-neud-operator-toast],
[data-neud-issue-bubble] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
}
html[data-neud-output-clean="1"],
html[data-neud-output-clean="1"] body {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
}
`;

const PORTAL_SELECTOR =
  "nextjs-portal, [data-next-badge-root], [data-nextjs-toast], #__next-build-watcher, [data-nextjs-dialog-overlay]";

function isProgramOutputPath(pathname: string | null, mode: string | null, preview: string | null): boolean {
  if (!pathname) return false;
  if (isHostedFullscreenViewerPath(pathname)) return true;
  // Stack / window-fit program surfaces never mount operator chrome.
  if (
    pathname.startsWith("/display/stack-fit") ||
    pathname.startsWith("/display/window-fit")
  ) {
    return true;
  }
  if (pathname.startsWith("/display/")) {
    return resolveDisplayViewMode({ preview, mode }) === "output";
  }
  if (pathname.startsWith("/api/display-html/")) return true;
  return false;
}

function hideNode(node: Element) {
  const el = node as HTMLElement;
  el.style.setProperty("display", "none", "important");
  el.style.setProperty("visibility", "hidden", "important");
  el.style.setProperty("opacity", "0", "important");
  el.style.setProperty("pointer-events", "none", "important");
  el.setAttribute("data-neud-output-suppressed", "1");
}

/**
 * Walk open shadow roots (Next.js issue badge often lives in a closed/open
 * shadow tree under nextjs-portal). Hide matching hosts and known badge nodes.
 */
function suppressDevChrome(root: ParentNode = document) {
  const nodes = root.querySelectorAll?.(PORTAL_SELECTOR) ?? [];
  for (const node of nodes) {
    hideNode(node);
    const shadow = (node as HTMLElement).shadowRoot;
    if (shadow) {
      for (const inner of shadow.querySelectorAll(
        "[data-next-badge], [data-next-badge-root], button, a, div",
      )) {
        const el = inner as HTMLElement;
        // Only hide badge-like fixed red pills, not entire page content.
        const style = shadow.ownerDocument?.defaultView?.getComputedStyle(el);
        const fixed =
          style?.position === "fixed" || style?.position === "absolute";
        const looksLikeBadge =
          el.hasAttribute("data-next-badge") ||
          el.hasAttribute("data-next-badge-root") ||
          (fixed && (style?.backgroundColor?.includes("255") || el.textContent === "1" || el.textContent === "N"));
        if (looksLikeBadge || el.hasAttribute("data-next-badge")) {
          hideNode(el);
        }
      }
      // Inject style into open shadow roots so CSS applies inside.
      if (!shadow.getElementById(CLEAN_STYLE_ID)) {
        const styleEl = document.createElement("style");
        styleEl.id = CLEAN_STYLE_ID;
        styleEl.textContent = CLEAN_CSS;
        shadow.appendChild(styleEl);
      }
    }
  }

  // Also scan top-level body children for unexpected portals.
  for (const child of Array.from(document.body?.children ?? [])) {
    const tag = child.tagName.toLowerCase();
    if (tag === "nextjs-portal" || child.hasAttribute("data-next-badge-root")) {
      hideNode(child);
    }
  }
}

/**
 * Mounted from the root shell. On program/output routes, injects CSS that hides
 * Next.js / React / operator issue bubbles — including open shadow roots.
 * Never affects the main NEUD UI.
 */
export function OutputCleanMode() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = isProgramOutputPath(
    pathname,
    searchParams.get("mode"),
    searchParams.get("preview"),
  );

  useEffect(() => {
    const html = document.documentElement;
    if (!active) {
      html.removeAttribute("data-neud-output-clean");
      document.getElementById(CLEAN_STYLE_ID)?.remove();
      return;
    }
    html.setAttribute("data-neud-output-clean", "1");
    let style = document.getElementById(CLEAN_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = CLEAN_STYLE_ID;
      style.textContent = CLEAN_CSS;
      document.head.appendChild(style);
    }
    suppressDevChrome();
    const observer = new MutationObserver(() => {
      suppressDevChrome();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      html.removeAttribute("data-neud-output-clean");
      document.getElementById(CLEAN_STYLE_ID)?.remove();
    };
  }, [active]);

  return null;
}
