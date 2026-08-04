"use client";

import { useMemo, useState } from "react";
import { PageSection } from "@/components/portal/PageSection";
import { TeamsPanel } from "./TeamsPanel";
import { UsersPanel } from "./UsersPanel";
import { ProjectAccessPanel } from "./ProjectAccessPanel";
import { InvitationsPanel } from "./InvitationsPanel";
import type { AccessManagementActions } from "@/lib/access-management/actions";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import { canInviteUsers } from "@/lib/access-management/capabilities";
import {
  canManageProjectAccess,
  resolveAccessCapabilities,
} from "@/lib/access-management/role-model";
import type { AccessManagementTabId } from "@/lib/access-management/routes";
import { useAccessManagementTabState } from "@/lib/access-management/use-access-management-tab-state";

export type { AccessManagementTabId };

type AccessManagementTabsProps = {
  directory: AccessManagementDirectory;
  currentUserId?: string | null;
  isOnline?: boolean;
  showOfflineConnectionMessage?: boolean;
  initialTab?: AccessManagementTabId;
  syncedAt?: string | null;
  stale?: boolean;
  actions?: AccessManagementActions;
};

const TAB_LABELS: Record<AccessManagementTabId, string> = {
  teams: "Teams",
  users: "Users",
  projects: "Project Access",
  invitations: "Invitations",
};

export function AccessManagementTabs({
  directory,
  currentUserId = null,
  isOnline = true,
  showOfflineConnectionMessage = false,
  initialTab = "teams",
  syncedAt,
  stale = false,
  actions,
}: AccessManagementTabsProps) {
  const [activeTab, setActiveTab] = useAccessManagementTabState(initialTab);

  const capabilityContext = useMemo(() => {
    const resolved = resolveAccessCapabilities(directory, currentUserId);
    const activeProjectId = directory.projects[0]?.id ?? "";
    const projectRole = activeProjectId
      ? directory.projectMembers.find(
          (member) =>
            member.projectId === activeProjectId && member.userId === currentUserId,
        )?.role ?? null
      : null;

    return {
      ...resolved,
      projectRole,
      isOnline,
    };
  }, [currentUserId, directory, isOnline]);

  const tabs: AccessManagementTabId[] = ["teams", "users", "projects", "invitations"];
  const writeEnabled = isOnline && Boolean(actions);
  const capabilities = useMemo(
    () => resolveAccessCapabilities(directory, currentUserId),
    [directory, currentUserId],
  );
  const canManageAnyProject =
    writeEnabled &&
    directory.projects.some((project) =>
      canManageProjectAccess(capabilities, project.id, directory, currentUserId),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={
                activeTab === tab
                  ? "rounded-md bg-surface-raised px-3 py-1.5 text-sm font-medium text-foreground"
                  : "rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground"
              }
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        {syncedAt ? (
          <p className="text-xs text-muted">
            {stale ? "Cached directory" : "Synced"} {new Date(syncedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      {showOfflineConnectionMessage ? (
        <p className="text-sm text-muted">
          Access management requires an internet connection.
        </p>
      ) : null}

      {activeTab === "teams" ? (
        <PageSection title="Teams">
          <TeamsPanel
            directory={directory}
            currentUserId={currentUserId}
            isOnline={isOnline}
            actions={writeEnabled ? actions : undefined}
          />
        </PageSection>
      ) : null}

      {activeTab === "users" ? (
        <PageSection title="Users">
          <UsersPanel directory={directory} showUserDetailsLinks />
        </PageSection>
      ) : null}

      {activeTab === "projects" ? (
        <PageSection title="Project Access">
          <ProjectAccessPanel
            directory={directory}
            currentUserId={currentUserId}
            isOnline={isOnline}
            actions={canManageAnyProject ? actions : undefined}
          />
        </PageSection>
      ) : null}

      {activeTab === "invitations" ? (
        <PageSection title="Invitations">
          <InvitationsPanel
            directory={directory}
            canInvite={canInviteUsers(capabilityContext) && writeEnabled}
            isOnline={isOnline}
            actions={writeEnabled ? actions : undefined}
          />
        </PageSection>
      ) : null}
    </div>
  );
}
