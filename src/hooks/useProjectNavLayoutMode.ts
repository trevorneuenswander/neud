"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

type ProjectNavLayoutMode = "horizontal" | "dropdown";

type UseProjectNavLayoutModeInput = {
  containerRef: RefObject<HTMLElement | null>;
  navMeasureRef: RefObject<HTMLElement | null>;
  statusRef: RefObject<HTMLElement | null>;
  /** Extra fixed width reserved beside measured nav (mobile menu trigger, gaps). */
  reservedWidth?: number;
};

/**
 * Collapse project navigation before it can overlap Last Poll / status controls.
 * Starts in dropdown mode until measured to avoid first-paint collision.
 */
export function useProjectNavLayoutMode({
  containerRef,
  navMeasureRef,
  statusRef,
  reservedWidth = 56,
}: UseProjectNavLayoutModeInput): ProjectNavLayoutMode {
  const [layoutMode, setLayoutMode] = useState<ProjectNavLayoutMode>("dropdown");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const navMeasure = navMeasureRef.current;
    const status = statusRef.current;
    if (!container || !navMeasure) {
      return;
    }

    const evaluate = () => {
      const statusWidth = status?.offsetWidth ?? 0;
      const navWidth = navMeasure.scrollWidth;
      const available = container.clientWidth;
      const needed = navWidth + statusWidth + reservedWidth;
      setLayoutMode(needed > available ? "dropdown" : "horizontal");
    };

    evaluate();

    const observer = new ResizeObserver(() => {
      evaluate();
    });

    observer.observe(container);
    observer.observe(navMeasure);
    if (status) {
      observer.observe(status);
    }

    return () => {
      observer.disconnect();
    };
  }, [containerRef, navMeasureRef, reservedWidth, statusRef]);

  return layoutMode;
}
