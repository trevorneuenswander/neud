"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ActivityProjectLink } from "@/components/activity/ActivityProjectLink";
import {
  ActivityUserLink,
  toLinkableUserIdSet,
} from "@/components/activity/ActivityUserLink";
import {
  ACTIVITY_ROW_MIN_HEIGHT_PX,
  ACTIVITY_ROW_GAP_PX,
  ACTIVITY_OVERVIEW_LIMIT,
  ACTIVITY_PANEL_VISIBLE_ROWS,
  isNearActivityTop,
  resolveActivityDisplayActorLabel,
  scrollActivityToTop,
} from "@/lib/projects/activity-panel";
import { selectCompactActivityEvents } from "@/lib/activity/normalize";
import {
  formatActivityTableDate,
  formatActivityTableDateTitle,
} from "@/lib/activity/format";
import type { ActivityDisplayEvent } from "@/lib/activity/types";

export type CompactActivityTableProps = {
  events: ActivityDisplayEvent[];
  showProjectColumn?: boolean;
  contextKey?: string;
  maxItems?: number;
  visibleRows?: number;
  pinToLatest?: boolean;
  emptyTitle?: string;
  linkableUserIds?: string[];
  headerActions?: React.ReactNode;
};

export function CompactActivityTable({
  events,
  showProjectColumn = false,
  contextKey = "activity-table",
  maxItems = ACTIVITY_OVERVIEW_LIMIT,
  visibleRows = ACTIVITY_PANEL_VISIBLE_ROWS,
  pinToLatest = false,
  emptyTitle = "No activity yet",
  linkableUserIds,
  headerActions,
}: CompactActivityTableProps) {
  const linkableUsers = useMemo(
    () => toLinkableUserIdSet(linkableUserIds),
    [linkableUserIds],
  );
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
    scrollActivityToTop(element);
    if (behavior === "smooth") {
      element.scrollTo({ top: 0, behavior });
    }
    setShowJumpToLatest(false);
  }, []);

  useLayoutEffect(() => {
    hasInitialScrolledRef.current = false;
    previousCountRef.current = 0;
  }, [contextKey]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || displayEvents.length === 0) return;

    if (pinToLatest) {
      requestAnimationFrame(() => scrollActivityToTop(element));
      hasInitialScrolledRef.current = true;
      previousCountRef.current = displayEvents.length;
      setShowJumpToLatest(false);
      return;
    }

    if (hasInitialScrolledRef.current) return;
    requestAnimationFrame(() => scrollActivityToTop(element));
    hasInitialScrolledRef.current = true;
    previousCountRef.current = displayEvents.length;
    setShowJumpToLatest(false);
  }, [displayEvents, contextKey, pinToLatest]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || displayEvents.length === 0) return;

    const hadNewEntry = displayEvents.length > previousCountRef.current;
    previousCountRef.current = displayEvents.length;

    if (pinToLatest) {
      scrollToLatest(hadNewEntry ? "smooth" : "auto");
      return;
    }

    if (!hadNewEntry) return;
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

  return (
    <div className="space-y-4">
      {headerActions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
      ) : null}
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
          className="min-h-0 overflow-y-auto overflow-x-auto rounded-md border border-border"
          style={{ height: scrollHeightPx }}
          onScroll={handleScroll}
        >
          {displayEvents.length === 0 ? (
            <EmptyState title={emptyTitle} />
          ) : (
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr>
                  {showProjectColumn ? (
                    <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                      Project
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                    User
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                    Description
                  </th>
                  <th
                    scope="col"
                    className="w-40 shrink-0 whitespace-nowrap px-3 py-2 text-left font-medium text-muted"
                  >
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {displayEvents.map((event) => {
                  const userLabel = resolveActivityDisplayActorLabel({
                    actorName: event.actorName,
                    actorId: event.actorId,
                    type: event.type,
                  });
                  const description = event.displayDescription ?? event.message;
                  const messageClassName =
                    event.severity === "error"
                      ? "text-danger"
                      : event.severity === "warning"
                        ? "text-warning"
                        : "text-foreground";

                  return (
                    <tr
                      key={event.id}
                      style={{ minHeight: ACTIVITY_ROW_MIN_HEIGHT_PX }}
                    >
                      {showProjectColumn ? (
                        <td className="px-3 py-2 align-top">
                          <ActivityProjectLink
                            projectSlug={event.projectSlug}
                            projectName={event.projectName ?? "Project unavailable"}
                            projectAvailable={event.projectAvailable}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2 align-top">
                        <ActivityUserLink
                          actorId={event.actorId}
                          actorName={userLabel}
                          eventType={event.type}
                          linkableUserIds={linkableUsers}
                        />
                      </td>
                      <td className={`activity-message px-3 py-2 align-top ${messageClassName}`}>
                        {description}
                      </td>
                      <td className="w-40 shrink-0 whitespace-nowrap px-3 py-2 align-top text-muted">
                        <time
                          dateTime={event.createdAt}
                          title={formatActivityTableDateTitle(event.createdAt)}
                        >
                          {formatActivityTableDate(event.createdAt)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
