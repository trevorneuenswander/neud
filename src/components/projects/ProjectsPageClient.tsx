"use client";

import { useCallback, useEffect, useState } from "react";
import { SessionRecoveryActions } from "@/components/auth/SessionRecoveryActions";
import { ProjectEmptyState } from "@/components/projects/ProjectEmptyState";
import { ProjectList } from "@/components/projects/ProjectList";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { localGetProjectsMeta, localRetryIdentitySync } from "@/lib/local/displays-api";
import { localListProjects } from "@/lib/local/api";
import type { AuthorizationContext } from "@/lib/access/types";
import type { LocalProjectsListMeta } from "@/lib/displays/types";
import type { ProjectListItem } from "@/lib/projects/types";

type ProjectsPageClientProps = {
  initialQuery: string;
  canCreateProject: boolean;
  hostedProjects?: ProjectListItem[];
  hostedViewerMode?: boolean;
};

type IdentityUiStatus = "loading" | "ready" | "error";
type ProjectsUiStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "identity-error"
  | "server-error";

function resolveIdentityUiStatus(meta: LocalProjectsListMeta | null): IdentityUiStatus {
  if (!meta) {
    return "loading";
  }
  if (
    meta.identityStatus === "loading-session" ||
    meta.identityStatus === "loading-profile"
  ) {
    return "loading";
  }
  if (
    meta.identityStatus === "ready" ||
    meta.identityStatus === "offline-ready"
  ) {
    return "ready";
  }
  return "error";
}

function isIdentityBlocked(meta: LocalProjectsListMeta | null): boolean {
  return resolveIdentityUiStatus(meta) === "error";
}

export function ProjectsPageClient({
  initialQuery,
  canCreateProject,
  hostedProjects,
  hostedViewerMode = false,
}: ProjectsPageClientProps) {
  const isLocalMode = shouldUseLocalDataClient();
  const [meta, setMeta] = useState<LocalProjectsListMeta | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>(hostedProjects ?? []);
  const [viewerMode, setViewerMode] = useState(hostedViewerMode);
  const [retryPending, setRetryPending] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<IdentityUiStatus>(
    isLocalMode ? "loading" : "ready",
  );
  const [projectsStatus, setProjectsStatus] = useState<ProjectsUiStatus>(
    isLocalMode ? "idle" : "ready",
  );
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const loadProjects = useCallback(
    async (nextMeta: LocalProjectsListMeta) => {
      setProjectsStatus("loading");
      setProjectsError(null);

      try {
        const suffix = initialQuery.trim()
          ? `?q=${encodeURIComponent(initialQuery.trim())}`
          : "";
        const list = await localListProjects(suffix);

        const context = nextMeta.authorizationContext as AuthorizationContext | undefined;
        const nextViewerMode = Boolean(
          context &&
            !context.isPlatformOwner &&
            !context.teamMemberships.some(
              (membership) =>
                membership.role === "admin" &&
                membership.isActive &&
                membership.teamIsActive,
            ) &&
            !context.teamMemberships.some(
              (membership) =>
                membership.role === "operator" &&
                membership.isActive &&
                membership.teamIsActive,
            ),
        );

        const nextProjects = list.projects as ProjectListItem[];
        setProjects(nextProjects);
        setViewerMode(nextViewerMode);
        setProjectsStatus(nextProjects.length > 0 ? "ready" : "empty");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Projects could not be loaded.";
        setProjects([]);
        setProjectsError(message);
        setProjectsStatus("server-error");
      }
    },
    [initialQuery],
  );

  useEffect(() => {
    if (!isLocalMode) {
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const nextMeta = await localGetProjectsMeta({ wait: false });
        if (controller.signal.aborted) {
          return;
        }

        setMeta(nextMeta);
        const nextIdentityStatus = resolveIdentityUiStatus(nextMeta);
        setIdentityStatus(nextIdentityStatus);

        if (nextIdentityStatus === "loading") {
          setProjectsStatus("idle");
          return;
        }

        if (nextIdentityStatus === "error") {
          setProjects([]);
          setProjectsStatus("identity-error");
          return;
        }

        await loadProjects(nextMeta);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setMeta(null);
        setIdentityStatus("error");
        setProjects([]);
        setProjectsStatus("identity-error");
        setProjectsError(
          error instanceof Error ? error.message : "Account could not be loaded.",
        );
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [initialQuery, isLocalMode, loadProjects]);

  useEffect(() => {
    if (!isLocalMode || identityStatus !== "loading") {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const timeoutMs = 30_000;

    const pollIdentity = async () => {
      while (!cancelled && Date.now() - startedAt <= timeoutMs) {
        try {
          const nextMeta = await localGetProjectsMeta({ wait: false });
          if (cancelled) {
            return;
          }

          const nextIdentityStatus = resolveIdentityUiStatus(nextMeta);
          if (nextIdentityStatus === "loading") {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          setMeta(nextMeta);
          setIdentityStatus(nextIdentityStatus);

          if (nextIdentityStatus === "ready") {
            await loadProjects(nextMeta);
          } else if (nextIdentityStatus === "error") {
            setProjects([]);
            setProjectsStatus("identity-error");
          }
          return;
        } catch {
          return;
        }
      }
    };

    void pollIdentity();

    return () => {
      cancelled = true;
    };
  }, [identityStatus, isLocalMode, loadProjects]);

  async function handleRetry() {
    setRetryPending(true);
    try {
      const result = await localRetryIdentitySync();
      setMeta(result.meta);
      const nextIdentityStatus = resolveIdentityUiStatus(result.meta);
      setIdentityStatus(nextIdentityStatus);

      if (nextIdentityStatus === "ready") {
        await loadProjects(result.meta);
      } else if (nextIdentityStatus === "error") {
        setProjects([]);
        setProjectsStatus("identity-error");
      }
    } finally {
      setRetryPending(false);
    }
  }

  if (!isLocalMode) {
    return projects.length > 0 ? (
      <ProjectList projects={projects} viewerMode={viewerMode} />
    ) : (
      <ProjectEmptyState showNewProjectAction={canCreateProject} isLocalMode={false} />
    );
  }

  if (identityStatus === "loading") {
    return (
      <div className="rounded-lg border border-border bg-surface-raised/40 p-6 text-sm text-muted">
        Loading account…
      </div>
    );
  }

  if (identityStatus === "error" || projectsStatus === "identity-error") {
    const title =
      meta?.identityStatus === "stale-session"
        ? "Your saved Supabase session is no longer valid. Sign in again."
        : meta?.identityStatus === "identity-conflict"
          ? "NEUD found conflicting local account records for this email."
          : "Account could not be loaded";

    return (
      <div className="space-y-4 rounded-lg border border-border bg-surface-raised/40 p-6">
        <p className="text-sm text-foreground">{title}</p>
        {meta?.identityMessage || projectsError ? (
          <p className="text-sm text-muted">{meta?.identityMessage ?? projectsError}</p>
        ) : null}
        <SessionRecoveryActions
          showClearLocalSession={meta?.identityStatus === "stale-session"}
          onRetry={() => void handleRetry()}
          retryPending={retryPending}
        />
      </div>
    );
  }

  if (projectsStatus === "loading") {
    return (
      <div className="rounded-lg border border-border bg-surface-raised/40 p-6 text-sm text-muted">
        Loading projects…
      </div>
    );
  }

  if (projectsStatus === "server-error") {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-surface-raised/40 p-6">
        <p className="text-sm text-foreground">Projects could not be loaded</p>
        {projectsError ? (
          <p className="text-sm text-muted">{projectsError}</p>
        ) : null}
        {meta ? (
          <p className="text-xs text-muted">Identity status: {meta.identityStatus}</p>
        ) : null}
        <SessionRecoveryActions
          onRetry={() => void loadProjects(meta!)}
          retryPending={retryPending}
        />
      </div>
    );
  }

  if (projects.length > 0) {
    return <ProjectList projects={projects} viewerMode={viewerMode} />;
  }

  return (
    <ProjectEmptyState showNewProjectAction={canCreateProject} isLocalMode={isLocalMode} />
  );
}
