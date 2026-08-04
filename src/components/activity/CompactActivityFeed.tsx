"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  ACTIVITY_ROW_MIN_HEIGHT_PX,
  ACTIVITY_ROW_GAP_PX,
  ACTIVITY_OVERVIEW_LIMIT,
  ACTIVITY_PANEL_VISIBLE_ROWS,
  isNearActivityTop,
  scrollActivityToTop,
} from "@/lib/projects/activity-panel";
import { formatRelativeTime, formatAbsoluteDateTime } from "@/lib/data-engines/format";
import { selectCompactActivityEvents } from "@/lib/activity/normalize";
import type { ActivityDisplayEvent } from "@/lib/activity/types";

export type CompactActivityFeedProps = {
  events: ActivityDisplayEvent[];
  showProjectName?: boolean;
  showUserLine?: boolean;
  /** Resets initial scroll when the feed context changes. */
  contextKey?: string;
  /** @deprecated Use contextKey */
  projectKey?: string;
  maxItems?: number;
  visibleRows?: number;
  /** Keep the feed scrolled to the newest event whenever data updates. */
  pinToLatest?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  getItemHref?: (event: ActivityDisplayEvent) => string | undefined;
  headerActions?: React.ReactNode;
  variant?: "card" | "section";
};

function defaultResolveHref(event: ActivityDisplayEvent): string | undefined {
  if (!event.projectSlug) {
    return undefined;
  }
  if (event.type?.startsWith("developer-tools.scraper")) {
    return `/projects/${event.projectSlug}/data-engines`;
  }
  if (event.type?.startsWith("developer-tools.display")) {
    return `/projects/${event.projectSlug}/displays`;
  }
  return `/projects/${event.projectSlug}`;
}

function ActivityRow({
  event,
  showProjectName,
  showUserLine,
  href,
}: {
  event: ActivityDisplayEvent;
  showProjectName: boolean;
  showUserLine: boolean;
  href?: string;
}) {
  const messageClassName =
    event.severity === "error"
      ? "text-danger"
      : event.severity === "warning"
        ? "text-warning"
        : showProjectName
          ? "mt-1 text-muted"
          : "text-foreground";

  const inner = showProjectName ? (
    <div className="min-w-0 flex-1">
      {event.projectName ? (
        <p className="text-sm font-medium text-foreground">{event.projectName}</p>
      ) : null}
      {showUserLine && event.actorName ? (
        <p className="mt-1 text-sm font-medium text-foreground">{event.actorName}</p>
      ) : null}
      <p className={`activity-message text-sm ${messageClassName}`}>{event.message}</p>
      <time
        className="mt-1 block text-xs text-muted"
        dateTime={event.createdAt}
        title={formatAbsoluteDateTime(event.createdAt)}
      >
        {formatRelativeTime(event.createdAt)}
      </time>
    </div>
  ) : (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {showUserLine && event.actorName ? (
          <p className="text-sm font-medium text-foreground">{event.actorName}</p>
        ) : null}
        <p
          className={`activity-message text-sm ${
            showUserLine ? "mt-1 text-muted" : messageClassName
          }`}
        >
          {event.message}
        </p>
      </div>
      <time
        className="shrink-0 text-xs text-muted"
        dateTime={event.createdAt}
        title={formatAbsoluteDateTime(event.createdAt)}
      >
        {formatRelativeTime(event.createdAt)}
      </time>
    </div>
  );

  const cardClassName =
    "block rounded-md border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const plainClassName = "block px-1 py-2";

  const className = showProjectName ? cardClassName : plainClassName;

  if (href) {
    return (
      <Link href={href} className={className} style={{ minHeight: ACTIVITY_ROW_MIN_HEIGHT_PX }}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} style={{ minHeight: ACTIVITY_ROW_MIN_HEIGHT_PX }}>
      {inner}
    </div>
  );
}

export function CompactActivityFeed({
  events,
  showProjectName = false,
  showUserLine = false,
  contextKey,
  projectKey = "global",
  maxItems = ACTIVITY_OVERVIEW_LIMIT,
  visibleRows = ACTIVITY_PANEL_VISIBLE_ROWS,
  pinToLatest = false,
  emptyTitle = "No activity yet",
  emptyDescription = "Operational events will appear here.",
  getItemHref = defaultResolveHref,
  headerActions,
  variant = "card",
}: CompactActivityFeedProps) {
  const feedContextKey = contextKey ?? projectKey;
  const scrollHeightPx =
    ACTIVITY_ROW_MIN_HEIGHT_PX * visibleRows +
    ACTIVITY_ROW_GAP_PX * (visibleRows - 1);
  const displayEvents = useMemo(
    () => selectCompactActivityEvents(events, maxItems),
    [events, maxItems],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const previousCountRef = useRef(displayEvents.length);
  const hasInitialScrolledRef = useRef(false);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scrollRef.current;
    if (!element) return;

    const run = () => {
      scrollActivityToTop(element);
      if (behavior === "smooth") {
        element.scrollTo({ top: 0, behavior });
      }
    };

    requestAnimationFrame(run);
    setShowJumpToLatest(false);
  }, []);

  useLayoutEffect(() => {
    hasInitialScrolledRef.current = false;
    previousCountRef.current = 0;
  }, [feedContextKey]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || displayEvents.length === 0) {
      return;
    }

    if (pinToLatest) {
      requestAnimationFrame(() => scrollActivityToTop(element));
      hasInitialScrolledRef.current = true;
      previousCountRef.current = displayEvents.length;
      setShowJumpToLatest(false);
      return;
    }

    if (hasInitialScrolledRef.current) {
      return;
    }

    requestAnimationFrame(() => scrollActivityToTop(element));
    hasInitialScrolledRef.current = true;
    previousCountRef.current = displayEvents.length;
    setShowJumpToLatest(false);
  }, [displayEvents, feedContextKey, pinToLatest]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || displayEvents.length === 0) {
      return;
    }

    const hadNewEntry = displayEvents.length > previousCountRef.current;
    previousCountRef.current = displayEvents.length;

    if (pinToLatest) {
      scrollToLatest(hadNewEntry ? "smooth" : "auto");
      return;
    }

    if (!hadNewEntry) {
      return;
    }

    if (isNearActivityTop(element)) {
      scrollToLatest("smooth");
    } else {
      setShowJumpToLatest(true);
    }
  }, [displayEvents, displayEvents.length, pinToLatest, scrollToLatest]);

  const handleScroll = useCallback(() => {
    if (pinToLatest) return;
    const element = scrollRef.current;
    if (!element) return;
    setShowJumpToLatest(!isNearActivityTop(element));
  }, [pinToLatest]);

  const listClassName = showProjectName ? "space-y-2" : "divide-y divide-border";

  const body = (
    <div className="relative min-h-0">
      {!pinToLatest && showJumpToLatest ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto shadow-sm"
            onClick={() => scrollToLatest("smooth")}
          >
            Jump to Latest
          </Button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 overflow-y-auto overflow-x-hidden"
        style={{ height: scrollHeightPx }}
        onScroll={handleScroll}
      >
        {displayEvents.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <ul className={listClassName} style={showProjectName ? { gap: ACTIVITY_ROW_GAP_PX } : undefined}>
            {displayEvents.map((event) => (
              <li key={event.id}>
                <ActivityRow
                  event={event}
                  showProjectName={showProjectName}
                  showUserLine={showUserLine}
                  href={getItemHref(event)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  if (variant === "section") {
    return (
      <div className="space-y-4">
        {headerActions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
        ) : null}
        {body}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface p-4">
      {headerActions ? (
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-end gap-2">
          {headerActions}
        </div>
      ) : null}
      {body}
    </div>
  );
}
