"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ActivityEmptyState } from "@/components/activity/ActivityEmptyState";
import { ActivityExportButton } from "@/components/activity/ActivityExportButton";
import { ActivityTable } from "@/components/activity/ActivityTable";
import {
  ACTIVITY_FULL_PAGE_SIZE,
  ACTIVITY_ORDER_OPTIONS,
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  resolveActivityDisplayActorLabel,
  type ActivityOrder,
} from "@/lib/projects/activity-panel";
import { type ActivityCsvRow } from "@/lib/activity/csv-export";
import {
  formatHostedAbsoluteTimestamp,
  formatHostedRelativeTimestamp,
} from "@/lib/hosted/format-hosted-timestamp";
import type { HostedActivityEvent } from "@/lib/hosted/activity-queries";
import type { ActivityDisplayEvent } from "@/lib/activity/types";

type HostedActivityProject = {
  id: string;
  slug: string;
  name: string;
};

type HostedActivityFullViewProps = {
  events: HostedActivityEvent[];
  projects: HostedActivityProject[];
};

function formatEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "online_viewer.enabled": "Online Viewer enabled",
    "online_viewer.disabled": "Online Viewer disabled",
    "display.published": "Display published",
    "display.updated": "Display updated",
    "display.enabled": "Display enabled",
    "display.disabled": "Display disabled",
    "project.settings_changed": "Project settings changed",
    "user.access_changed": "User access changed",
    "scraper.started": "Scraper started",
    "scraper.stopped": "Scraper stopped",
    "controller.data_updated": "Local Controller updated",
    "data-source.changed": "Data source changed",
    "team.created": "Team created",
    "team.updated": "Team updated",
    "team.archived": "Team archived",
    "team.member_added": "Team member added",
    "team.member_removed": "Team member removed",
    "team.member_role_changed": "Team member role changed",
    "project.member_added": "Project member added",
    "project.member_removed": "Project member removed",
    "project.member_role_changed": "Project member role changed",
    "project.team_assigned": "Team assigned to project",
    "project.team_removed": "Team removed from project",
    "invitation.created": "Invitation created",
    "invitation.resent": "Invitation resent",
    "invitation.revoked": "Invitation revoked",
    "invitation.accepted": "Invitation accepted",
    "invitation.expired": "Invitation expired",
  };
  return (
    labels[eventType] ??
    eventType
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function mapHostedEvents(events: HostedActivityEvent[]): ActivityDisplayEvent[] {
  return events.map((event) => ({
    id: event.id,
    projectId: event.projectId ?? "",
    projectSlug: event.projectSlug ?? undefined,
    projectName: event.projectName ?? undefined,
    projectAvailable: Boolean(event.projectSlug),
    actorId: event.actorId ?? undefined,
    actorName: resolveActivityDisplayActorLabel({
      actorName: event.actorName,
      actorId: event.actorId,
      type: event.eventType,
    }),
    message: event.description,
    displayDescription: event.description,
    createdAt: event.occurredAt,
    type: event.eventType,
  }));
}

function toHostedCsvRows(events: ActivityDisplayEvent[]): ActivityCsvRow[] {
  return events.map((event) => ({
    projectName: event.projectName ?? "Project unavailable",
    user: resolveActivityDisplayActorLabel({
      actorName: event.actorName,
      actorId: event.actorId,
      type: event.type,
    }),
    description: event.displayDescription ?? event.message,
    createdAt: event.createdAt,
    eventType: formatEventTypeLabel(event.type ?? "event"),
  }));
}

export function HostedActivityFullView({ events, projects }: HostedActivityFullViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<ActivityOrder>(
    searchParams.get("order") === "oldest-first" ? "oldest-first" : "newest-first",
  );
  const [projectFilter, setProjectFilter] = useState(searchParams.get("project") ?? "all");
  const [actorFilter, setActorFilter] = useState(searchParams.get("user") ?? "all");
  const [eventFilter, setEventFilter] = useState(searchParams.get("event") ?? "all");
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (projectFilter !== "all") params.set("project", projectFilter);
    if (actorFilter !== "all") params.set("user", actorFilter);
    if (eventFilter !== "all") params.set("event", eventFilter);
    if (searchText.trim()) params.set("q", searchText.trim());
    if (order !== "newest-first") params.set("order", order);
    const next = params.toString();
    router.replace(next ? `?${next}` : "?", { scroll: false });
  }, [actorFilter, eventFilter, order, projectFilter, router, searchText]);

  const mappedEvents = useMemo(() => mapHostedEvents(events), [events]);

  const actorOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const event of mappedEvents) {
      labels.add(
        resolveActivityDisplayActorLabel({
          actorName: event.actorName,
          actorId: event.actorId,
          type: event.type,
        }),
      );
    }
    return [...labels].sort((left, right) => left.localeCompare(right));
  }, [mappedEvents]);

  const eventTypeOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const event of mappedEvents) {
      const eventType = event.type ?? "event";
      labels.set(eventType, formatEventTypeLabel(eventType));
    }
    return [...labels.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [mappedEvents]);

  const filteredEvents = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    let next = mappedEvents;

    if (projectFilter !== "all") {
      next = next.filter((event) => event.projectId === projectFilter);
    }
    if (actorFilter !== "all") {
      next = next.filter(
        (event) =>
          resolveActivityDisplayActorLabel({
            actorName: event.actorName,
            actorId: event.actorId,
            type: event.type,
          }) === actorFilter,
      );
    }
    if (eventFilter !== "all") {
      next = next.filter((event) => event.type === eventFilter);
    }
    if (needle) {
      next = next.filter((event) => {
        const haystack = [
          event.projectName,
          event.actorName,
          event.message,
          event.displayDescription,
          formatEventTypeLabel(event.type ?? "event"),
          formatHostedAbsoluteTimestamp(event.createdAt),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    return order === "newest-first" ? next : [...next].reverse();
  }, [actorFilter, eventFilter, mappedEvents, order, projectFilter, searchText]);

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / ACTIVITY_FULL_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = useMemo(() => {
    const start = currentPage * ACTIVITY_FULL_PAGE_SIZE;
    return filteredEvents.slice(start, start + ACTIVITY_FULL_PAGE_SIZE);
  }, [currentPage, filteredEvents]);

  useEffect(() => {
    setPage(0);
  }, [actorFilter, eventFilter, order, projectFilter, searchText]);

  const exportRows = useMemo(() => toHostedCsvRows(filteredEvents), [filteredEvents]);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Project</span>
            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">User</span>
            <select
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All users</option>
              {actorOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Event type</span>
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All events</option>
              {eventTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Order</span>
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as ActivityOrder)}
              className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
            >
              {ACTIVITY_ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
            <span className="text-muted">Search</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search activity"
              className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
        <ActivityExportButton
          rows={exportRows}
          scope="global"
          disabled={filteredEvents.length === 0}
        />
      </div>

      {filteredEvents.length === 0 ? (
        <ActivityEmptyState
          title="No activity found"
          description="Try adjusting filters or check back after project operations run."
        />
      ) : (
        <>
          <ActivityTable
            events={pageEntries.map((event) => ({
              ...event,
              createdAtLabel: formatHostedRelativeTimestamp(event.createdAt),
              createdAtTitle: formatHostedAbsoluteTimestamp(event.createdAt),
              eventTypeLabel: formatEventTypeLabel(event.type ?? "event"),
            }))}
            showProjectName
            linkableUserIds={[]}
          />
          <div className="flex items-center justify-between gap-3 text-sm text-muted">
            <p>
              Showing {pageEntries.length} of {filteredEvents.length} events
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage <= 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous
              </Button>
              <span>
                Page {currentPage + 1} of {pageCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
