"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ActivitySyncStatus } from "@/components/activity/ActivitySyncStatus";
import { ActivityEmptyState } from "@/components/activity/ActivityEmptyState";
import { ActivityExportButton } from "@/components/activity/ActivityExportButton";
import { ActivityTable } from "@/components/activity/ActivityTable";
import { useActivitySession } from "@/lib/desktop/activity-session-client";
import { useLinkableUserIds } from "@/lib/activity/use-linkable-user-ids";
import { localListProjects } from "@/lib/local/api";
import {
  buildActivityProjectSummaryMap,
  normalizeActivityEventsForProjects,
} from "@/lib/activity/normalize";
import { withActivityDisplayDescription } from "@/lib/activity/description";
import { filterActivityEventsForProject, filterPresentableActivityEntries } from "@/lib/activity/filter";
import type { ActivityCsvRow } from "@/lib/activity/csv-export";
import type { ActivityDisplayEvent, ActivityProjectSummary } from "@/lib/activity/types";
import {
  ACTIVITY_FULL_PAGE_SIZE,
  ACTIVITY_ORDER_OPTIONS,
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  filterActivityEntries,
  getUniqueActivityActorLabels,
  resolveActivityDisplayActorLabel,
  type ActivityOrder,
} from "@/lib/projects/activity-panel";

type ActivityFullViewProps = {
  scope: "global" | "project";
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  projectEngineIds?: string[];
};

function toCsvRows(events: ActivityDisplayEvent[]): ActivityCsvRow[] {
  return events.map((event) => ({
    projectName: event.projectName ?? "Project unavailable",
    user: resolveActivityDisplayActorLabel({
      actorName: event.actorName,
      actorId: event.actorId,
      type: event.type,
    }),
    description: event.displayDescription ?? event.message,
    createdAt: event.createdAt,
  }));
}

export function ActivityFullView({
  scope,
  projectId,
  projectSlug,
  projectName,
  projectEngineIds = [],
}: ActivityFullViewProps) {
  const { entries } = useActivitySession();
  const linkableUserIds = useLinkableUserIds();
  const [order, setOrder] = useState<ActivityOrder>("newest-first");
  const [actorFilter, setActorFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [projects, setProjects] = useState<ActivityProjectSummary[]>([]);

  useEffect(() => {
    void localListProjects()
      .then((result) => {
        const summaries = (result.projects as Array<Record<string, unknown>>).flatMap(
          (project) => {
            const id = typeof project.id === "string" ? project.id : null;
            const slugValue = typeof project.slug === "string" ? project.slug : null;
            const name = typeof project.name === "string" ? project.name : null;
            if (!id || !slugValue || !name) {
              return [];
            }
            return [{
              id,
              slug: slugValue,
              name,
              description:
                typeof project.description === "string" ? project.description : null,
            } satisfies ActivityProjectSummary];
          },
        );
        setProjects(summaries);
      })
      .catch(() => {
        // Keep the last known project summaries.
      });
  }, []);

  const scopedProjects = useMemo(() => {
    if (scope === "project" && projectId && projectSlug && projectName) {
      const existing = projects.find((project) => project.id === projectId);
      if (existing) {
        return [existing];
      }
      return [{ id: projectId, slug: projectSlug, name: projectName }];
    }
    return projects;
  }, [projectId, projectName, projectSlug, projects, scope]);

  const projectById = useMemo(
    () => buildActivityProjectSummaryMap(scopedProjects),
    [scopedProjects],
  );

  const scopedRawEntries = useMemo(() => {
    let next = filterPresentableActivityEntries(filterActivityEntries(entries, actorFilter));

    if (scope === "project" && projectId) {
      return filterActivityEventsForProject(next, {
        projectId,
        projectSlug,
        projectEngineIds,
      });
    }

    if (projectFilter !== "all") {
      next = next.filter((entry) => entry.metadata?.projectId === projectFilter);
    }

    return next;
  }, [actorFilter, entries, projectEngineIds, projectFilter, projectId, projectSlug, scope]);

  const filteredEvents = useMemo(() => {
    const normalized = normalizeActivityEventsForProjects({
      events: scopedRawEntries,
      projects: scopedProjects,
      projectId: scope === "project" ? projectId : undefined,
      projectSlug: scope === "project" ? projectSlug : undefined,
      projectEngineIds: scope === "project" ? projectEngineIds : undefined,
      maxItems: null,
    }).map((event) =>
      withActivityDisplayDescription({
        ...event,
        projectName:
          event.projectName ?? projectById.get(event.projectId)?.name ?? "Project unavailable",
        actorName: resolveActivityDisplayActorLabel({
          actorName: event.actorName,
          actorId: event.actorId,
          type: event.type,
        }),
        message: event.message || "Activity recorded",
      }),
    );

    return order === "newest-first" ? normalized : [...normalized].reverse();
  }, [
    order,
    projectById,
    projectEngineIds,
    projectId,
    projectSlug,
    scopedProjects,
    scopedRawEntries,
    scope,
  ]);

  const actorOptions = useMemo(() => {
    const sourceEntries =
      scope === "project" && projectId
        ? entries.filter((entry) => {
            const normalized = normalizeActivityEventsForProjects({
              events: [entry],
              projects: scopedProjects,
              projectId,
              projectSlug,
              projectEngineIds,
              maxItems: null,
            });
            return normalized.length > 0;
          })
        : entries;
    return getUniqueActivityActorLabels(sourceEntries);
  }, [entries, projectEngineIds, projectId, projectSlug, scopedProjects, scope]);

  const projectOptions = useMemo(
    () =>
      [...scopedProjects]
        .map((project) => ({
          id: project.id,
          slug: project.slug,
          name: project.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [scopedProjects],
  );

  const exportRows = useMemo(() => toCsvRows(filteredEvents), [filteredEvents]);

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / ACTIVITY_FULL_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = useMemo(() => {
    const start = currentPage * ACTIVITY_FULL_PAGE_SIZE;
    return filteredEvents.slice(start, start + ACTIVITY_FULL_PAGE_SIZE);
  }, [currentPage, filteredEvents]);

  useEffect(() => {
    setPage(0);
  }, [actorFilter, order, projectFilter, projectId]);

  const hasAnyEvents = useMemo(() => {
    if (scope === "project" && projectId) {
      return (
        normalizeActivityEventsForProjects({
          events: entries,
          projects: scopedProjects,
          projectId,
          projectSlug,
          projectEngineIds,
          maxItems: null,
        }).length > 0
      );
    }
    return (
      normalizeActivityEventsForProjects({
        events: entries,
        projects: scopedProjects,
        maxItems: null,
      }).length > 0
    );
  }, [entries, projectEngineIds, projectId, projectSlug, scopedProjects, scope]);

  return (
    <Card className="space-y-4">
      <ActivitySyncStatus />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {scope === "global" ? (
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Project</span>
              <select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
              >
                <option value="all">All projects</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
        </div>
        <ActivityExportButton
          rows={exportRows}
          scope={scope}
          projectSlug={projectSlug}
          disabled={filteredEvents.length === 0}
        />
      </div>

      {!hasAnyEvents ? (
        <ActivityEmptyState
          title="No activity yet"
          description="Operational events will appear here."
        />
      ) : filteredEvents.length === 0 ? (
        <ActivityEmptyState
          title="No activity matches the current filters"
          description={
            actorFilter === ACTIVITY_SYSTEM_ACTOR_LABEL
              ? "No system activity matches this filter."
              : "Try changing the project or user filter."
          }
        />
      ) : (
        <ActivityTable
          events={pageEntries}
          showProjectName={scope === "global"}
          linkableUserIds={linkableUserIds}
        />
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Previous
          </Button>
          <p className="text-sm text-muted">
            Page {currentPage + 1} of {pageCount} · {filteredEvents.length} events
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
